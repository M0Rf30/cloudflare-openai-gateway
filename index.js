import { Router, cors } from 'itty-router';

// import the routes
import { chatHandler } from './routes/chat';
import { completionHandler } from './routes/completion';
import { embeddingsHandler } from './routes/embeddings';
import { transcriptionHandler, translationHandler, speechHandler } from './routes/audio';
import { getImageHandler, imageGenerationHandler } from './routes/image';
import { modelsHandler } from './routes/models';
import * as rag from './routes/rag';
import { systemOneHandler } from './routes/systemone';

// import utilities
import { AuthenticationError, createErrorResponse, handleError } from './utils/errors.js';

const { preflight, corsify } = cors({
	origin: '*',
	allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
	maxAge: 86400,
});
const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

// Create a new router: CORS preflight first, CORS headers on every response (incl. errors/streams)
const router = Router({
	base: '/v1',
	before: [preflight],
	catch: handleError,
	finally: [corsify],
});

const encoder = new TextEncoder();

function extractToken(authorizationHeader) {
	const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader ?? '');
	return match ? match[1] : null;
}

// Constant-time comparison of two secrets via fixed-length SHA-256 digests.
async function safeEqual(a, b) {
	const [da, db] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(a)),
		crypto.subtle.digest('SHA-256', encoder.encode(b)),
	]);
	if (typeof crypto.subtle.timingSafeEqual === 'function') {
		return crypto.subtle.timingSafeEqual(da, db);
	}
	const x = new Uint8Array(da);
	const y = new Uint8Array(db);
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
	return diff === 0;
}

// Signed image URLs are verified by the image handler itself, so they bypass the bearer check.
const isPublicRoute = request =>
	request.method === 'GET' && /^\/v1\/images\/get\/[^/]+$/.test(new URL(request.url).pathname);

// MIDDLEWARE: bearer token authentication
const bearerAuthentication = async (request, env) => {
	if (isPublicRoute(request)) return;
	const token = extractToken(request.headers.get('Authorization'));
	if (!token) {
		return createErrorResponse(new AuthenticationError('Missing or malformed Authorization header'));
	}
	if (!env.ACCESS_TOKEN || !(await safeEqual(token, env.ACCESS_TOKEN))) {
		return createErrorResponse(new AuthenticationError('Invalid API key'));
	}
};

router
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
	// System One API (decision models: Clef)
	.post('/systemone', systemOneHandler)
	// RAG endpoints
	.post('/rag/documents', rag.storeDocumentHandler)
	.delete('/rag/documents/:docId', rag.deleteDocumentHandler)
	.post('/rag/search', rag.ragSearchHandler)
	.post('/rag/chat', rag.ragChatHandler);

// 404 for everything else under /v1
router.all('*', () =>
	Response.json(
		{
			error: {
				message: 'Unknown endpoint. See GET /v1/models for available models.',
				type: 'not_found_error',
			},
		},
		{ status: 404 },
	),
);

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
						systemone: '/v1/systemone',
					},
					documentation: 'https://github.com/M0Rf30/cloudflare-openai-gateway',
				},
				{ headers: corsHeaders },
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
			{ status: 404, headers: corsHeaders },
		);
	},
};
