import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { imageGenerationHandler, getImageHandler } from '../../routes/image.js';
import { DEFAULT_MODELS } from '../../utils/models.js';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const PNG_BASE64 = toBase64(PNG_BYTES);

const createBucket = () => {
	const objects = new Map();
	return {
		objects,
		put: vi.fn(async (name, body, options) => {
			objects.set(name, { body, httpMetadata: options?.httpMetadata });
		}),
		get: vi.fn(async name => {
			const object = objects.get(name);
			if (!object) return null;
			return { body: object.body, httpMetadata: object.httpMetadata, httpEtag: '"etag"' };
		}),
	};
};

const createEnv = (extra = {}) => ({
	AI: { run: vi.fn() },
	ACCESS_TOKEN: 'test-token',
	...extra,
});

const generate = (env, body) =>
	imageGenerationHandler(
		new Request('https://gateway.test/v1/images/generations', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		env,
	);

const fetchImage = (env, url) => {
	const request = new Request(url);
	request.params = { name: new URL(url).pathname.split('/').pop() };
	return getImageHandler(request, env);
};

describe('Image generation', () => {
	let env;

	beforeEach(() => {
		env = createEnv();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('uses the default model (flux-1-schnell) when none is given', async () => {
		expect(DEFAULT_MODELS.image_generation).toBe('@cf/black-forest-labs/flux-1-schnell');
		env.AI.run.mockResolvedValue({ image: PNG_BASE64 });

		const response = await generate(env, { prompt: 'a red fox', response_format: 'b64_json' });
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(env.AI.run).toHaveBeenCalledWith('@cf/black-forest-labs/flux-1-schnell', { prompt: 'a red fox' });
		expect(result.data).toHaveLength(1);
		expect(result.data[0].b64_json).toBe(PNG_BASE64);
	});

	it('maps dall-e-3 to flux-1-schnell and ignores size for fixed-size models', async () => {
		env.AI.run.mockResolvedValue({ image: PNG_BASE64 });

		const response = await generate(env, { model: 'dall-e-3', prompt: 'x', size: '1792x1024', response_format: 'b64_json' });

		expect(response.status).toBe(200);
		expect(env.AI.run).toHaveBeenCalledWith('@cf/black-forest-labs/flux-1-schnell', { prompt: 'x' });
	});

	it('honours the legacy `format` field', async () => {
		env.AI.run.mockResolvedValue({ image: PNG_BASE64 });

		const result = await (await generate(env, { prompt: 'x', format: 'b64_json' })).json();

		expect(result.data[0].b64_json).toBe(PNG_BASE64);
	});

	it('rejects an invalid response_format', async () => {
		const response = await generate(env, { prompt: 'x', response_format: 'png' });

		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('falls back to base64 with a warning when IMAGE_BUCKET is unbound and url is requested', async () => {
		env.AI.run.mockResolvedValue({ image: PNG_BASE64 });

		const result = await (await generate(env, { prompt: 'x' })).json();

		expect(result.data[0].b64_json).toBe(PNG_BASE64);
		expect(result.data[0].warning).toMatch(/R2 bucket not configured/);
	});

	it('generates n images with one model call each and rejects n above the limit', async () => {
		env.AI.run.mockResolvedValue({ image: PNG_BASE64 });

		const ok = await (await generate(env, { prompt: 'x', n: 3, response_format: 'b64_json' })).json();
		expect(ok.data).toHaveLength(3);
		expect(env.AI.run).toHaveBeenCalledTimes(3);

		const tooMany = await generate(env, { prompt: 'x', n: 5 });
		expect(tooMany.status).toBe(400);
		const zero = await generate(env, { prompt: 'x', n: 0 });
		expect(zero.status).toBe(400);
	});

	it('requires a prompt', async () => {
		expect((await generate(env, {})).status).toBe(400);
	});

	it('passes size and seed to SDXL and encodes the binary PNG stream', async () => {
		env.AI.run.mockResolvedValue(new Response(PNG_BYTES).body);

		const result = await (
			await generate(env, {
				model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
				prompt: 'x',
				size: '512x768',
				seed: 7,
				response_format: 'b64_json',
			})
		).json();

		expect(env.AI.run).toHaveBeenCalledWith('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
			prompt: 'x',
			width: 512,
			height: 768,
			seed: 7,
		});
		expect(result.data[0].b64_json).toBe(PNG_BASE64);
	});

	it('rejects malformed or out-of-range sizes for models that take them', async () => {
		const model = '@cf/stabilityai/stable-diffusion-xl-base-1.0';

		expect((await generate(env, { model, prompt: 'x', size: 'big' })).status).toBe(400);
		expect((await generate(env, { model, prompt: 'x', size: '64x64' })).status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('sends FLUX.2 models a multipart form input', async () => {
		env.AI.run.mockResolvedValue({ image: PNG_BASE64 });

		const response = await generate(env, {
			model: '@cf/black-forest-labs/flux-2-klein-9b',
			prompt: 'a lighthouse',
			size: '1024x768',
			response_format: 'b64_json',
		});

		expect(response.status).toBe(200);
		const [model, input] = env.AI.run.mock.calls[0];
		expect(model).toBe('@cf/black-forest-labs/flux-2-klein-9b');
		expect(Object.keys(input)).toEqual(['multipart']);
		expect(input.multipart.contentType).toMatch(/^multipart\/form-data; boundary=/);
		const body = await new Response(input.multipart.body).text();
		expect(body).toContain('name="prompt"');
		expect(body).toContain('a lighthouse');
		expect(body).toContain('name="width"');
		expect(body).toContain('1024');
		expect(body).toContain('768');
	});

	it('rejects inpainting models, which need an input image and mask', async () => {
		const response = await generate(env, {
			model: '@cf/runwayml/stable-diffusion-v1-5-inpainting',
			prompt: 'x',
		});

		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	describe('stored images and signed URLs', () => {
		let bucket;

		beforeEach(() => {
			bucket = createBucket();
			env = createEnv({ IMAGE_BUCKET: bucket });
		});

		it('stores the real content type and returns a signed URL that can be fetched', async () => {
			env.AI.run.mockResolvedValue({ image: toBase64(JPEG_BYTES) });

			const result = await (await generate(env, { prompt: 'x' })).json();
			const url = new URL(result.data[0].url);

			expect(url.origin).toBe('https://gateway.test');
			expect(url.pathname).toMatch(/^\/v1\/images\/get\/[0-9a-f-]{36}\.jpg$/);
			expect(url.searchParams.get('exp')).toMatch(/^\d+$/);
			expect(url.searchParams.get('sig')).toMatch(/^[0-9a-f]{64}$/);
			const [name, bytes, options] = bucket.put.mock.calls[0];
			expect(name).toMatch(/\.jpg$/);
			expect(Array.from(bytes)).toEqual(Array.from(JPEG_BYTES));
			expect(options.httpMetadata.contentType).toBe('image/jpeg');

			const image = await fetchImage(env, url.toString());
			expect(image.status).toBe(200);
			expect(image.headers.get('Content-Type')).toBe('image/jpeg');
			expect(image.headers.get('Cache-Control')).toMatch(/^public, max-age=\d+$/);
			expect(new Uint8Array(await image.arrayBuffer())).toEqual(JPEG_BYTES);
		});

		it('rejects a tampered signature, tampered expiry and a missing signature', async () => {
			env.AI.run.mockResolvedValue({ image: PNG_BASE64 });
			const url = new URL((await (await generate(env, { prompt: 'x' })).json()).data[0].url);

			const badSig = new URL(url);
			badSig.searchParams.set('sig', 'a'.repeat(64));
			expect((await fetchImage(env, badSig.toString())).status).toBe(403);

			const badExp = new URL(url);
			badExp.searchParams.set('exp', String(Number(url.searchParams.get('exp')) + 3600));
			expect((await fetchImage(env, badExp.toString())).status).toBe(403);

			const notHex = new URL(url);
			notHex.searchParams.set('sig', 'zz');
			expect((await fetchImage(env, notHex.toString())).status).toBe(403);

			const noSig = new URL(url);
			noSig.searchParams.delete('sig');
			expect((await fetchImage(env, noSig.toString())).status).toBe(403);
		});

		it('rejects a signature issued for a different image or with a different token', async () => {
			env.AI.run.mockResolvedValue({ image: PNG_BASE64 });
			const url = new URL((await (await generate(env, { prompt: 'x' })).json()).data[0].url);

			const otherName = new URL(url);
			otherName.pathname = '/v1/images/get/00000000-0000-4000-8000-000000000000.png';
			bucket.objects.set('00000000-0000-4000-8000-000000000000.png', { body: PNG_BYTES });
			expect((await fetchImage(env, otherName.toString())).status).toBe(403);

			const otherToken = createEnv({ IMAGE_BUCKET: bucket, ACCESS_TOKEN: 'another-token' });
			expect((await fetchImage(otherToken, url.toString())).status).toBe(403);
		});

		it('rejects an expired URL', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
			env.AI.run.mockResolvedValue({ image: PNG_BASE64 });
			const url = (await (await generate(env, { prompt: 'x' })).json()).data[0].url;

			vi.setSystemTime(new Date('2026-01-01T00:59:59Z'));
			expect((await fetchImage(env, url)).status).toBe(200);

			vi.setSystemTime(new Date('2026-01-01T01:00:01Z'));
			const expired = await fetchImage(env, url);
			expect(expired.status).toBe(403);
			expect((await expired.json()).error.message).toMatch(/expired/);
		});

		it('returns 404 for names that are not generated image names', async () => {
			const response = await fetchImage(env, 'https://gateway.test/v1/images/get/..%2Fsecret?exp=1&sig=aa');

			expect(response.status).toBe(404);
			expect(bucket.get).not.toHaveBeenCalled();
		});

		it('returns 404 for a validly signed but missing image', async () => {
			env.AI.run.mockResolvedValue({ image: PNG_BASE64 });
			const url = (await (await generate(env, { prompt: 'x' })).json()).data[0].url;
			bucket.objects.clear();

			expect((await fetchImage(env, url)).status).toBe(404);
		});
	});

	it('returns a 501 JSON error when serving images without an IMAGE_BUCKET', async () => {
		const response = await fetchImage(
			env,
			'https://gateway.test/v1/images/get/00000000-0000-4000-8000-000000000000.png?exp=1&sig=aa',
		);

		expect(response.status).toBe(501);
		expect((await response.json()).error.code).toBe('image_storage_unavailable');
	});
});
