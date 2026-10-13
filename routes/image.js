import { arrayBufferToBase64 } from '../utils/format.js';
import { base64ToBytes, bytesToHex, hexToBytes } from '../utils/binary.js';
import { resolveModel } from '../utils/models.js';
import {
	APIError,
	asyncErrorHandler,
	NotFoundError,
	PermissionError,
	ServerError,
	ValidationError,
} from '../utils/errors.js';

// Free plan: every extra image is another sequential model call, so keep `n` small.
const MAX_IMAGES_PER_REQUEST = 4;
// OpenAI image URLs also expire after one hour.
const SIGNED_URL_TTL_SECONDS = 3600;
const IMAGE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;
const EXTENSION_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const TYPE_BY_EXTENSION = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// --- Per-model input adapters -------------------------------------------------
// Each adapter turns the normalised request into the input the model's published schema expects.
// Models without a width/height input render at their fixed size and ignore `size`.

/** JSON input, prompt only (flux-1-schnell has additionalProperties:false and a fixed size). */
const promptOnly = () => ({
	build: ({ prompt }) => ({ prompt }),
});

/** JSON input with width/height/seed (SDXL family, Dreamshaper, Leonardo). */
const jsonSized = (min, max) => ({
	min,
	max,
	build: ({ prompt, width, height, seed }) => {
		const input = { prompt };
		if (width !== undefined) input.width = width;
		if (height !== undefined) input.height = height;
		if (seed !== undefined) input.seed = seed;
		return input;
	},
});

/** FLUX.2 models only accept `{ multipart: { body, contentType } }` carrying form fields. */
const multipartSized = (min, max) => ({
	min,
	max,
	build: ({ prompt, width, height, seed }) => {
		const form = new FormData();
		form.append('prompt', prompt);
		if (width !== undefined) form.append('width', String(width));
		if (height !== undefined) form.append('height', String(height));
		if (seed !== undefined) form.append('seed', String(seed));
		// Serialising through a Request yields the multipart stream + boundary header the binding expects.
		const serialised = new Request('http://multipart.invalid', { method: 'POST', body: form });
		return {
			multipart: {
				body: serialised.body,
				contentType: serialised.headers.get('content-type'),
			},
		};
	},
});

const IMAGE_ADAPTERS = {
	'@cf/black-forest-labs/flux-1-schnell': promptOnly(),
	'@cf/black-forest-labs/flux-2-klein-9b': multipartSized(256, 1920),
	'@cf/black-forest-labs/flux-2-klein-4b': multipartSized(256, 1920),
	'@cf/black-forest-labs/flux-2-dev': multipartSized(256, 1920),
	'@cf/stabilityai/stable-diffusion-xl-base-1.0': jsonSized(256, 2048),
	'@cf/bytedance/stable-diffusion-xl-lightning': jsonSized(256, 2048),
	'@cf/lykon/dreamshaper-8-lcm': jsonSized(256, 2048),
	'@cf/leonardo/phoenix-1.0': jsonSized(1, 2048),
	'@cf/leonardo/lucid-origin': jsonSized(1, 2500),
};

// --- Request parsing ----------------------------------------------------------

function parseSize(size, adapter) {
	if (size === undefined || size === null || size === 'auto') return {};
	const match = typeof size === 'string' ? /^(\d{1,5})x(\d{1,5})$/.exec(size) : null;
	if (!match) {
		throw new ValidationError('size must be a string like "1024x1024"', 'size');
	}
	if (adapter.min === undefined) return {}; // model renders at a fixed size
	const width = Number(match[1]);
	const height = Number(match[2]);
	for (const side of [width, height]) {
		if (side < adapter.min || side > adapter.max) {
			throw new ValidationError(
				`size must be between ${adapter.min}x${adapter.min} and ${adapter.max}x${adapter.max} for this model`,
				'size',
			);
		}
	}
	return { width, height };
}

// --- Model output handling ----------------------------------------------------

/** Detect the image type from the first bytes (PNG, JPEG, WebP); defaults to PNG. */
function sniffImageType(bytes) {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
		bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
	) {
		return 'image/webp';
	}
	return 'image/png';
}

/**
 * Normalise the heterogeneous model outputs into `{ base64?, bytes?, contentType }`.
 * - `{ image: <base64> }` (flux, lucid-origin, flux-2): the base64 is passed through untouched.
 * - binary (SDXL, Dreamshaper, Phoenix): ReadableStream / Response / ArrayBuffer / Uint8Array.
 */
async function readModelImage(response) {
	if (response && typeof response === 'object' && typeof response.image === 'string') {
		return {
			base64: response.image,
			contentType: sniffImageType(base64ToBytes(response.image.slice(0, 16))),
		};
	}

	let buffer;
	if (response instanceof ReadableStream) {
		buffer = await new Response(response).arrayBuffer();
	} else if (response instanceof Response) {
		buffer = await response.arrayBuffer();
	} else if (response instanceof ArrayBuffer || ArrayBuffer.isView(response)) {
		buffer = response;
	} else {
		throw new ServerError('Image model returned an unexpected response');
	}
	const bytes = new Uint8Array(buffer.buffer ?? buffer, buffer.byteOffset ?? 0, buffer.byteLength);
	if (bytes.length === 0) {
		throw new ServerError('Image model returned an empty image');
	}
	return { bytes, contentType: sniffImageType(bytes) };
}

// --- Signed URLs --------------------------------------------------------------

async function getSigningKey(env) {
	if (!env.ACCESS_TOKEN) {
		throw new ServerError('ACCESS_TOKEN is not configured; cannot sign image URLs');
	}
	const material = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`image-url-signing:v1:${env.ACCESS_TOKEN}`),
	);
	return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const signedPayload = (name, exp) => new TextEncoder().encode(`${name}\n${exp}`);

async function signImageUrl(env, origin, name, now) {
	const exp = now + SIGNED_URL_TTL_SECONDS;
	const key = await getSigningKey(env);
	const sig = bytesToHex(await crypto.subtle.sign('HMAC', key, signedPayload(name, exp)));
	return `${origin}/v1/images/get/${name}?exp=${exp}&sig=${sig}`;
}

// --- Handlers -----------------------------------------------------------------

export const imageGenerationHandler = asyncErrorHandler(async (request, env) => {
	const created = Math.floor(Date.now() / 1000);

	if (!request.headers.get('Content-Type')?.includes('application/json')) {
		throw new ValidationError('Invalid request. Content-Type must be application/json');
	}

	const json = await request.json();

	if (typeof json?.prompt !== 'string' || json.prompt.length === 0) {
		throw new ValidationError('no prompt provided', 'prompt');
	}

	// OpenAI uses `response_format`; `format` is the gateway's legacy spelling.
	const format = json.response_format ?? json.format ?? 'url';
	if (format !== 'b64_json' && format !== 'url') {
		throw new ValidationError('invalid response_format. must be b64_json or url', 'response_format');
	}

	const n = json.n ?? 1;
	if (!Number.isInteger(n) || n < 1 || n > MAX_IMAGES_PER_REQUEST) {
		throw new ValidationError(`n must be an integer between 1 and ${MAX_IMAGES_PER_REQUEST}`, 'n');
	}

	if (json.seed !== undefined && (!Number.isInteger(json.seed) || json.seed < 0)) {
		throw new ValidationError('seed must be a non-negative integer', 'seed');
	}

	// Supports both OpenAI and Cloudflare model names; falls back to the category default.
	const model = resolveModel('image_generation', json.model);
	const adapter = IMAGE_ADAPTERS[model];
	if (!adapter) {
		throw new ValidationError(`Image generation is not supported for model ${model}`, 'model');
	}

	const { width, height } = parseSize(json.size, adapter);
	const origin = new URL(request.url).origin;
	const data = [];

	for (let i = 0; i < n; i++) {
		// Rebuilt per call: multipart bodies are single-use streams.
		const input = adapter.build({ prompt: json.prompt, width, height, seed: json.seed });
		const image = await readModelImage(await env.AI.run(model, input));

		if (format === 'url' && env.IMAGE_BUCKET) {
			const bytes = image.bytes ?? base64ToBytes(image.base64);
			const name = `${crypto.randomUUID()}.${EXTENSION_BY_TYPE[image.contentType]}`;
			await env.IMAGE_BUCKET.put(name, bytes, {
				httpMetadata: { contentType: image.contentType },
			});
			data.push({
				url: await signImageUrl(env, origin, name, created),
				revised_prompt: json.prompt, // OpenAI compatibility
			});
			continue;
		}

		const entry = {
			b64_json: image.base64 ?? arrayBufferToBase64(image.bytes),
			revised_prompt: json.prompt,
		};
		if (format === 'url') {
			entry.warning = 'R2 bucket not configured, returning base64 instead of URL';
		}
		data.push(entry);
	}

	return Response.json({ created, data });
});

export const getImageHandler = asyncErrorHandler(async (request, env) => {
	const name = request.params?.name;

	if (!name || !IMAGE_NAME_PATTERN.test(name)) {
		throw new NotFoundError('Image not found');
	}

	if (!env.IMAGE_BUCKET) {
		throw new APIError(
			'Image storage (IMAGE_BUCKET) is not configured on this deployment',
			'api_error',
			501,
			'image_storage_unavailable',
		);
	}

	// Access is granted by an HMAC-signed, expiring URL (bearer auth is skipped for this route).
	const params = new URL(request.url).searchParams;
	const exp = Number(params.get('exp'));
	const signature = hexToBytes(params.get('sig'));
	if (!Number.isInteger(exp) || !signature) {
		throw new PermissionError('Missing or malformed image URL signature');
	}
	const key = await getSigningKey(env);
	const valid = await crypto.subtle.verify('HMAC', key, signature, signedPayload(name, exp));
	if (!valid) {
		throw new PermissionError('Invalid image URL signature');
	}
	const remaining = exp - Math.floor(Date.now() / 1000);
	if (remaining <= 0) {
		throw new PermissionError('Image URL has expired');
	}

	const image = await env.IMAGE_BUCKET.get(name);
	if (!image) {
		throw new NotFoundError('Image not found');
	}

	const headers = {
		'Content-Type': image.httpMetadata?.contentType ?? TYPE_BY_EXTENSION[name.split('.').pop()],
		// The signature is part of the cache key and the URL stops working at `exp`.
		'Cache-Control': `public, max-age=${remaining}`,
		'X-Content-Type-Options': 'nosniff',
	};
	if (image.httpEtag) headers.ETag = image.httpEtag;

	return new Response(image.body, { headers });
});
