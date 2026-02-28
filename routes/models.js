import { getCORSHeaders } from '../utils/format.js';

const getModels = async env => {
	const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search?hide_experimental=false`;
	const headers = {
		'Content-Type': 'application/json',
		'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
	};

	const response = await fetch(url, { headers });

	if (!response.ok) {
		throw new Error(`Failed to fetch models: ${response.statusText}`);
	}

	const data = await response.json();

	return data.result;
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

export const modelsHandler = async (request, env) => {
	const timestamp = Math.round(Date.now());

	if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
		// In test mode, return OpenAI aliases plus a test model
		return Response.json(
			{
				object: 'list',
				data: [
					...OPENAI_MODEL_ALIASES.map(model => ({ ...model, created: timestamp })),
					{
						id: 'test-model',
						object: 'model',
						created: timestamp,
						owned_by: 'cloudflare',
					},
				],
			},
			{ headers: getCORSHeaders() },
		);
	}

	const models = await getModels(env);

	// Map Cloudflare models to OpenAI format
	const cloudflareModels = models.map(model => ({
		id: model.name,
		object: 'model',
		created: timestamp,
		owned_by: model.source === 1 ? 'cloudflare' : 'huggingface',
	}));

	// Combine OpenAI aliases with Cloudflare models
	return Response.json(
		{
			object: 'list',
			data: [...OPENAI_MODEL_ALIASES.map(model => ({ ...model, created: timestamp })), ...cloudflareModels],
		},
		{ headers: getCORSHeaders() },
	);
};
