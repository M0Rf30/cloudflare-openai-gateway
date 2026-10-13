import { ServerError, asyncErrorHandler } from '../utils/errors.js';

const MODELS_CACHE_TTL_SECONDS = 300;

const fetchModels = async env => {
	const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search?hide_experimental=false`;
	const response = await fetch(url, {
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
		},
	});

	if (!response.ok) {
		throw new ServerError(`Failed to fetch models: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	return data.result;
};

// Cache the upstream list in the colo cache (when available) to save subrequests.
const getModels = async env => {
	const cache = typeof caches !== 'undefined' ? caches.default : null;
	const cacheKey = cache
		? new Request(`https://models.cache.invalid/${env.CLOUDFLARE_ACCOUNT_ID}`)
		: null;

	if (cache) {
		const hit = await cache.match(cacheKey);
		if (hit) return hit.json();
	}

	const models = await fetchModels(env);

	if (cache) {
		await cache.put(
			cacheKey,
			Response.json(models, {
				headers: { 'Cache-Control': `public, max-age=${MODELS_CACHE_TTL_SECONDS}` },
			}),
		);
	}

	return models;
};

// OpenAI-compatible model aliases for compatibility with Nextcloud and other OpenAI clients
const OPENAI_MODEL_ALIASES = [
	// Chat/Completion models
	{ id: 'gpt-3.5-turbo', object: 'model', owned_by: 'openai' },
	{ id: 'gpt-4', object: 'model', owned_by: 'openai' },
	{ id: 'gpt-4o', object: 'model', owned_by: 'openai' },
	{ id: 'gpt-4-turbo', object: 'model', owned_by: 'openai' },
	{ id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' },
	// Text-to-Speech models
	{ id: 'tts-1', object: 'model', owned_by: 'openai' },
	{ id: 'tts-1-hd', object: 'model', owned_by: 'openai' },
	// Speech-to-Text models
	{ id: 'whisper-1', object: 'model', owned_by: 'openai' },
	// Embedding models
	{ id: 'text-embedding-ada-002', object: 'model', owned_by: 'openai' },
	{ id: 'text-embedding-3-small', object: 'model', owned_by: 'openai' },
	{ id: 'text-embedding-3-large', object: 'model', owned_by: 'openai' },
	// Image generation models
	{ id: 'dall-e-2', object: 'model', owned_by: 'openai' },
	{ id: 'dall-e-3', object: 'model', owned_by: 'openai' },
];

export const modelsHandler = asyncErrorHandler(async (request, env) => {
	const created = Math.floor(Date.now() / 1000);
	const aliases = OPENAI_MODEL_ALIASES.map(model => ({ ...model, created }));

	if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
		// Only an explicit test environment may run without the Cloudflare API secrets.
		if (env.ENVIRONMENT === 'test') {
			return Response.json({
				object: 'list',
				data: [...aliases, { id: 'test-model', object: 'model', created, owned_by: 'cloudflare' }],
			});
		}
		throw new ServerError(
			'Model listing is not configured: set the CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN secrets',
		);
	}

	const models = await getModels(env);

	const cloudflareModels = models.map(model => ({
		id: model.name,
		object: 'model',
		created,
		owned_by: model.source === 1 ? 'cloudflare' : 'huggingface',
	}));

	return Response.json({ object: 'list', data: [...aliases, ...cloudflareModels] });
});
