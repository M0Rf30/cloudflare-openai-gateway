import { uint8ArrayToBase64 } from '../utils/converters';
import { uuidv4 } from '../utils/ids';
import { streamToBuffer } from '../utils/stream';
import { resolveModel } from '../utils/models.js';
import { asyncErrorHandler, ValidationError, NotFoundError } from '../utils/errors.js';

export const imageGenerationHandler = asyncErrorHandler(async (request, env) => {
	let model = '@cf/black-forest-labs/flux-1-schnell'; // Default model
	let format = 'url';
	const created = Math.floor(Date.now() / 1000);

	if (!request.headers.get('Content-Type')?.includes('application/json')) {
		throw new ValidationError('Invalid request. Content-Type must be application/json');
	}

	const json = await request.json();

	if (!json?.prompt) {
		throw new ValidationError('no prompt provided');
	}

	if (json?.format) {
		format = json.format;
		if (format !== 'b64_json' && format !== 'url') {
			throw new ValidationError('invalid format. must be b64_json or url');
		}
	}

	// Handle model selection - support both OpenAI and Cloudflare model names
	if (json?.model) {
		model = resolveModel('image_generation', json.model);
	} else {
		// Use default model if none provided
		model = resolveModel('image_generation');
	}

	const inputs = {
		prompt: json.prompt,
		seed: json.seed || Math.floor(Math.random() * 10000),
	};

	// Run the AI model
	const response = await env.AI.run(model, inputs);

	// Handle the response based on the model type
	let imageBuffer;

	if (response.image) {
		// For models that return base64 string (like Flux)
		const binaryString = atob(response.image);
		imageBuffer = Uint8Array.from(binaryString, m => m.codePointAt(0));
	} else if (response instanceof ReadableStream) {
		// For models that return streams
		imageBuffer = await streamToBuffer(response);
	} else {
		// Fallback: assume response is already a buffer
		imageBuffer = new Uint8Array(response);
	}

	if (format === 'b64_json') {
		const b64_json = uint8ArrayToBase64(imageBuffer);
		return Response.json({
			data: [
				{
					b64_json,
					revised_prompt: json.prompt, // OpenAI compatibility
				},
			],
			created,
		});
	} else {
		// Check if R2 bucket is available
		if (!env.IMAGE_BUCKET) {
			// Fallback to base64 if no R2 bucket configured
			const b64_json = uint8ArrayToBase64(imageBuffer);
			return Response.json({
				data: [
					{
						b64_json,
						revised_prompt: json.prompt,
						warning: 'R2 bucket not configured, returning base64 instead of URL',
					},
				],
				created,
			});
		}

		const name = uuidv4() + '.png';
		await env.IMAGE_BUCKET.put(name, imageBuffer);

		// Construct the URL
		const urlObj = new URL(request.url);
		const url = urlObj.origin + '/v1/images/get/' + name;

		return Response.json({
			data: [
				{
					url,
					revised_prompt: json.prompt, // OpenAI compatibility
				},
			],
			created,
		});
	}
});

export const getImageHandler = asyncErrorHandler(async (request, env) => {
	const { params } = request;
	const { name } = params;

	if (!name) {
		throw new NotFoundError('Image name not provided');
	}

	const image = await env.IMAGE_BUCKET.get(name);
	if (!image) {
		throw new NotFoundError('Image not found');
	}

	return new Response(image.body, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
		},
	});
});
