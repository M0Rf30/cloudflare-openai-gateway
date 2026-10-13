import {
	DEFAULT_NAMESPACE,
	MAX_NAMESPACE_LENGTH,
	MAX_TOP_K,
	deleteDocument,
	performRAGSearch,
	processAndStoreDocument,
} from '../utils/vectorize.js';
import { resolveModel } from '../utils/models.js';
import { asyncErrorHandler, NotFoundError, ValidationError } from '../utils/errors.js';
import { chatHandler } from './chat.js';

async function readJsonBody(request) {
	if (!request.headers.get('Content-Type')?.includes('application/json')) {
		throw new ValidationError('Content-Type must be application/json');
	}
	const body = await request.json();
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new ValidationError('Request body must be a JSON object');
	}
	return body;
}

function readNamespace(value) {
	const namespace = value ?? DEFAULT_NAMESPACE;
	if (typeof namespace !== 'string' || namespace.length === 0 || new TextEncoder().encode(namespace).length > MAX_NAMESPACE_LENGTH) {
		throw new ValidationError(`namespace must be a non-empty string of at most ${MAX_NAMESPACE_LENGTH} bytes`, 'namespace');
	}
	return namespace;
}

function readNumber(value, name, fallback, { min, max, integer = false }) {
	const number = value ?? fallback;
	if (typeof number !== 'number' || !Number.isFinite(number) || (integer && !Number.isInteger(number))) {
		throw new ValidationError(`${name} must be ${integer ? 'an integer' : 'a number'}`, name);
	}
	return Math.min(Math.max(number, min), max);
}

const readTopK = (value, name, fallback) => readNumber(value, name, fallback, { min: 1, max: MAX_TOP_K, integer: true });
// Cosine similarity range.
const readScoreThreshold = (value, name) => readNumber(value, name, 0.7, { min: -1, max: 1 });

/** Plain text of a chat message whose content is a string or an array of content parts. */
function messageText(content) {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map(part => (typeof part === 'string' ? part : part?.type === 'text' ? part.text : ''))
			.filter(text => typeof text === 'string' && text.length > 0)
			.join('\n');
	}
	return '';
}

/**
 * Handler for storing documents in Vectorize for RAG
 */
export const storeDocumentHandler = asyncErrorHandler(async (request, env) => {
	const body = await readJsonBody(request);

	if (typeof body.text !== 'string' || body.text.trim().length === 0) {
		throw new ValidationError('Missing required field: text', 'text');
	}

	const docId = body.metadata?.docId;
	if (typeof docId !== 'string' || docId.length === 0 || docId.length > 256) {
		throw new ValidationError('metadata.docId must be a non-empty string of at most 256 characters', 'metadata.docId');
	}

	const options = {
		model: resolveModel('rag', body.model),
		chunkSize: body.chunkSize ?? 1000,
		chunkOverlap: body.chunkOverlap ?? 200,
		namespace: readNamespace(body.namespace),
	};

	const result = await processAndStoreDocument(env, body.text, body.metadata, options);

	return Response.json({
		success: true,
		document_id: result.documentId,
		chunks_processed: result.chunksProcessed,
		vectors_stored: result.vectorsStored,
	});
});

/**
 * Handler for deleting every chunk of a stored document
 * DELETE /v1/rag/documents/:docId?namespace=...
 */
export const deleteDocumentHandler = asyncErrorHandler(async (request, env) => {
	let docId;
	try {
		docId = decodeURIComponent(request.params?.docId ?? '');
	} catch {
		throw new ValidationError('Invalid document id', 'docId');
	}
	if (docId.length === 0) {
		throw new ValidationError('Missing document id', 'docId');
	}
	const namespace = readNamespace(new URL(request.url).searchParams.get('namespace') ?? undefined);

	const result = await deleteDocument(env, docId, namespace);
	if (!result.found) {
		throw new NotFoundError(`Document not found: ${docId}`);
	}

	return Response.json({
		id: docId,
		object: 'rag.document.deleted',
		deleted: true,
		vectors_deleted: result.vectorsDeleted,
	});
});

/**
 * Handler for RAG search
 */
export const ragSearchHandler = asyncErrorHandler(async (request, env) => {
	const body = await readJsonBody(request);

	if (typeof body.query !== 'string' || body.query.trim().length === 0) {
		throw new ValidationError('Missing required field: query', 'query');
	}

	const options = {
		model: resolveModel('rag', body.model),
		topK: readTopK(body.top_k, 'top_k', 5),
		scoreThreshold: readScoreThreshold(body.score_threshold, 'score_threshold'),
		namespace: readNamespace(body.namespace),
	};

	const result = await performRAGSearch(env, body.query, options);

	return Response.json({
		query: result.query,
		context: result.context,
		sources: result.sources,
	});
});

/**
 * Handler for RAG-enhanced chat completions
 */
export const ragChatHandler = asyncErrorHandler(async (request, env, ctx) => {
	const body = await readJsonBody(request);

	if (!Array.isArray(body.messages) || body.messages.length === 0) {
		throw new ValidationError('Missing or invalid messages array', 'messages');
	}

	// Get the last user message for RAG search
	const lastMessage = body.messages[body.messages.length - 1];
	if (lastMessage?.role !== 'user') {
		throw new ValidationError('Last message must be from user', 'messages');
	}
	const query = messageText(lastMessage.content).trim();
	if (query.length === 0) {
		throw new ValidationError('Last user message has no text to search with', 'messages');
	}

	// Perform RAG search
	const ragResult = await performRAGSearch(env, query, {
		model: resolveModel('rag', body.embedding_model),
		topK: readTopK(body.rag_top_k, 'rag_top_k', 3),
		scoreThreshold: readScoreThreshold(body.rag_score_threshold, 'rag_score_threshold'),
		namespace: readNamespace(body.namespace),
	});

	// Enhance the conversation with RAG context
	const enhancedMessages = [...body.messages];
	if (ragResult.context) {
		const contextMessage = {
			role: 'system',
			content: `Use the following context to help answer the user's question. If the context doesn't contain relevant information, you can still use your general knowledge.

Context:
${ragResult.context}

Sources: ${ragResult.sources.length} relevant documents found.`,
		};

		// Insert context before the last message
		enhancedMessages.splice(-1, 0, contextMessage);
	}

	// Forward to the regular chat handler without the RAG-only fields
	const chatBody = { ...body };
	for (const field of ['embedding_model', 'rag_top_k', 'rag_score_threshold', 'namespace']) {
		delete chatBody[field];
	}
	const headers = new Headers(request.headers);
	headers.delete('content-length');
	const chatRequest = new Request(request.url.replace('/v1/rag/chat', '/v1/chat/completions'), {
		method: 'POST',
		headers,
		body: JSON.stringify({ ...chatBody, messages: enhancedMessages }),
	});

	const response = await chatHandler(chatRequest, env, ctx);

	// Streaming responses are passed through untouched (an SSE body cannot carry rag_sources).
	if (chatBody.stream || !response.ok) {
		return response;
	}

	// Add RAG metadata to the response
	const chatResponse = await response.json();
	chatResponse.rag_sources = ragResult.sources;
	return Response.json(chatResponse);
});
