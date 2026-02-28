import { Router } from 'itty-router';

// import the routes
import { chatHandler } from './routes/chat';
import { completionHandler } from './routes/completion';
import { embeddingsHandler } from './routes/embeddings';
import { transcriptionHandler, translationHandler, speechHandler } from './routes/audio';
import { getImageHandler, imageGenerationHandler } from './routes/image';
import { modelsHandler } from './routes/models';
import { storeDocumentHandler, ragSearchHandler, ragChatHandler } from './routes/rag';

// import utilities
import { DistributedRateLimiter } from './utils/DistributedRateLimiter';
import { getCORSHeaders } from './utils/format.js';
import { AuthenticationError, PermissionError, createErrorResponse } from './utils/errors.js';

// Create a new router
const router = Router({ base: '/v1' });

function extractToken(authorizationHeader) {
	if (authorizationHeader) {
		const parts = authorizationHeader.split(' ');
		if (parts.length === 2 && parts[0] === 'Bearer') {
			return parts[1];
		}
	}
	return null;
}

// CORS preflight handler - must run before auth
const handleCORS = (request) => {
	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: getCORSHeaders(),
		});
	}
};

// MIDDLEWARE: withAuthenticatedUser - embeds user in Request or returns a 401
const bearerAuthentication = (request, env) => {
	const authorizationHeader = request.headers.get('Authorization');
	if (!authorizationHeader) {
		return createErrorResponse(new AuthenticationError('Unauthorized'));
	}
	const access_token = extractToken(authorizationHeader);
	if (env.ACCESS_TOKEN !== access_token) {
		return createErrorResponse(new PermissionError('Forbidden'));
	}
};

router
	// .all('*', rateLimit) // Rate limiting disabled
	.all('*', handleCORS)
	.all('*', bearerAuthentication)
	.post('/chat/completions', chatHandler)
	.post('/completions', completionHandler)
	.post('/embeddings', embeddingsHandler)
	.post('/audio/transcriptions', transcriptionHandler)
	.post('/audio/translations', translationHandler)
	.post('/audio/speech', speechHandler)
	.post('/images/generations', imageGenerationHandler)
	.get('/images/get/:name', getImageHandler)
	.get('/models', modelsHandler)
	// RAG endpoints
	.post('/rag/documents', storeDocumentHandler)
	.post('/rag/search', ragSearchHandler)
	.post('/rag/chat', ragChatHandler);

// 404 for everything else under /v1
router.all('*', () =>
	Response.json(
		{
			error: {
				message: 'Unknown endpoint. See GET /v1/models for available models.',
				type: 'not_found_error',
			},
		},
		{ status: 404, headers: getCORSHeaders() },
	),
);

// Export the Durable Object
export { DistributedRateLimiter };

// Root handler wraps the router to serve requests outside /v1
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Landing page at root
		if (url.pathname === '/' || url.pathname === '') {
			return Response.json(
				{
					name: 'OpenAI-Compatible Cloudflare Workers AI Gateway',
					version: '1.0.0',
					description:
						'Drop-in replacement for the OpenAI API, powered by Cloudflare Workers AI.',
					endpoints: {
						models: '/v1/models',
						chat_completions: '/v1/chat/completions',
						completions: '/v1/completions',
						embeddings: '/v1/embeddings',
						audio_transcriptions: '/v1/audio/transcriptions',
						audio_translations: '/v1/audio/translations',
						audio_speech: '/v1/audio/speech',
						image_generations: '/v1/images/generations',
						rag_documents: '/v1/rag/documents',
						rag_search: '/v1/rag/search',
						rag_chat: '/v1/rag/chat',
					},
					documentation: 'https://github.com/M0Rf30/openai-cf-workers-ai',
				},
				{ headers: getCORSHeaders() },
			);
		}

		// Delegate /v1/* to the router
		if (url.pathname.startsWith('/v1')) {
			return router.fetch(request, env, ctx);
		}

		// Everything else is a 404
		return Response.json(
			{
				error: {
					message: 'Not found. API endpoints are available under /v1.',
					type: 'not_found_error',
				},
			},
			{ status: 404, headers: getCORSHeaders() },
		);
	},
};
