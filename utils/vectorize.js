/**
 * Cloudflare Vectorize + Workers AI embedding utilities for RAG.
 *
 * Vectors are partitioned with Vectorize's native namespaces (no metadata index required) and use
 * deterministic IDs (`<sha256(namespace, docId)[:32]>:<chunkIndex>`), so re-ingesting a document
 * replaces its vectors instead of duplicating them and a document can be deleted by ID.
 */

import { APIError, ValidationError } from './errors.js';
import { sha256Hex } from './binary.js';

export const DEFAULT_NAMESPACE = 'documents';
export const MAX_NAMESPACE_LENGTH = 64;

// Vectorize limits: topK <= 20 when metadata is returned, metadata <= 10 KiB per vector,
// IDs <= 64 bytes. Workers free plan: 50 subrequests per invocation.
export const MAX_TOP_K = 20;
export const MIN_CHUNK_SIZE = 100;
export const MAX_CHUNK_SIZE = 2000;
export const MAX_CHUNKS_PER_DOCUMENT = 500;
const MAX_METADATA_BYTES = 10 * 1024;
const UPSERT_BATCH_SIZE = 1000;
const DELETE_BATCH_SIZE = 100;
const DEFAULT_INDEX_DIMENSIONS = 768;

/** Output dimensions of the supported embedding models. */
export const EMBEDDING_DIMENSIONS = {
	'@cf/baai/bge-small-en-v1.5': 384,
	'@cf/baai/bge-base-en-v1.5': 768,
	'@cf/baai/bge-large-en-v1.5': 1024,
	'@cf/baai/bge-m3': 1024,
	'@cf/qwen/qwen3-embedding-0.6b': 1024,
	'@cf/google/embeddinggemma-300m': 768,
	'@cf/pfnet/plamo-embedding-1b': 2048,
};

/** Max items per `text` array; models not listed accept 100 (bge, embeddinggemma). */
const EMBEDDING_BATCH_LIMITS = {
	'@cf/qwen/qwen3-embedding-0.6b': 32,
};
const DEFAULT_EMBEDDING_BATCH_LIMIT = 100;

/** Only the bge-*-en-v1.5 models take the `pooling` input. */
const POOLING_MODELS = new Set([
	'@cf/baai/bge-small-en-v1.5',
	'@cf/baai/bge-base-en-v1.5',
	'@cf/baai/bge-large-en-v1.5',
]);

export const getEmbeddingBatchLimit = model => EMBEDDING_BATCH_LIMITS[model] ?? DEFAULT_EMBEDDING_BATCH_LIMIT;
export const supportsPooling = model => POOLING_MODELS.has(model);

/**
 * Run an embedding model over `texts`, splitting into batches the model accepts.
 * @param {Object} env - Environment with AI binding
 * @param {string} model - Cloudflare embedding model
 * @param {string[]} texts
 * @param {Object} [options] - { pooling }
 * @returns {Promise<number[][]>} one vector per text, in order
 */
export async function embedTexts(env, model, texts, options = {}) {
	const limit = getEmbeddingBatchLimit(model);
	const vectors = [];

	for (let offset = 0; offset < texts.length; offset += limit) {
		const batch = texts.slice(offset, offset + limit);
		const input = { text: batch };
		if (options.pooling && supportsPooling(model)) {
			input.pooling = options.pooling;
		}

		const response = await env.AI.run(model, input);
		if (!Array.isArray(response?.data) || response.data.length !== batch.length) {
			throw new APIError(
				`Embedding model ${model} returned an unexpected response`,
				'server_error',
				502,
			);
		}
		vectors.push(...response.data);
	}

	return vectors;
}

function requireIndex(env) {
	if (!env.VECTOR_INDEX) {
		throw new APIError(
			'Vectorize index (VECTOR_INDEX) is not configured on this deployment',
			'server_error',
			503,
			'vectorize_not_configured',
		);
	}
	return env.VECTOR_INDEX;
}

const getIndexDimensions = env => Number(env.VECTOR_INDEX_DIMENSIONS) || DEFAULT_INDEX_DIMENSIONS;

function assertModelMatchesIndex(env, model) {
	const indexDimensions = getIndexDimensions(env);
	const modelDimensions = EMBEDDING_DIMENSIONS[model];
	if (modelDimensions !== undefined && modelDimensions !== indexDimensions) {
		throw new ValidationError(
			`Embedding model ${model} produces ${modelDimensions}-dimensional vectors but the Vectorize index uses ${indexDimensions}`,
			'model',
		);
	}
}

function assertVectorDimensions(env, model, vectors) {
	const indexDimensions = getIndexDimensions(env);
	for (const vector of vectors) {
		if (vector.length !== indexDimensions) {
			throw new ValidationError(
				`Embedding model ${model} returned ${vector.length}-dimensional vectors but the Vectorize index uses ${indexDimensions}`,
				'model',
			);
		}
	}
}

function wrapVectorizeError(prefix, error) {
	if (error instanceof APIError) return error;
	return new Error(`${prefix}: ${error.message}`, { cause: error });
}

/**
 * Upsert vectors (each may carry its own `namespace`).
 * @param {VectorizeIndex} vectorIndex - Vectorize index binding
 * @param {Array} vectors - Array of { id, values, namespace?, metadata? }
 * @returns {Promise<Object>} { success, count }
 */
export async function storeVectors(vectorIndex, vectors) {
	try {
		for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
			await vectorIndex.upsert(vectors.slice(i, i + UPSERT_BATCH_SIZE));
		}
		return { success: true, count: vectors.length };
	} catch (error) {
		throw wrapVectorizeError('Vectorize storage failed', error);
	}
}

/**
 * Search for similar vectors in a namespace.
 * @param {VectorizeIndex} vectorIndex - Vectorize index binding
 * @param {Array<number>} queryVector - Query vector
 * @param {Object} options - { topK, scoreThreshold, namespace }
 * @returns {Promise<Array>} Matches with score >= scoreThreshold
 */
export async function searchVectors(vectorIndex, queryVector, options = {}) {
	const { topK = 5, scoreThreshold = 0.7, namespace = DEFAULT_NAMESPACE } = options;

	try {
		const results = await vectorIndex.query(queryVector, { topK, namespace, returnMetadata: 'all' });

		return (results?.matches ?? [])
			.filter(match => match.score >= scoreThreshold)
			.map(match => ({
				id: match.id,
				score: match.score,
				metadata: match.metadata,
				text: match.metadata?.text || '',
			}));
	} catch (error) {
		throw wrapVectorizeError('Vectorize search failed', error);
	}
}

/**
 * Deterministic vector id prefix for a document within a namespace.
 */
async function documentPrefix(namespace, docId) {
	return (await sha256Hex(`${namespace}\u0000${docId}`)).slice(0, 32);
}

const chunkId = (prefix, index) => `${prefix}:${index}`;

/**
 * Split text into overlapping chunks. Always terminates: the window start advances by at least
 * a quarter of the chunk size per iteration, and overlap is required to stay below half the chunk size.
 * @param {string} text
 * @param {number} chunkSize - characters per chunk
 * @param {number} overlap - characters shared between consecutive chunks
 * @returns {Array<string>}
 */
export function splitTextIntoChunks(text, chunkSize = 1000, overlap = 200) {
	validateChunking(chunkSize, overlap);

	const chunks = [];
	let start = 0;

	while (start < text.length) {
		let end = Math.min(start + chunkSize, text.length);

		// Prefer breaking at a sentence/line boundary in the second half of the window.
		if (end < text.length) {
			const breakPoint = Math.max(text.lastIndexOf('.', end - 1), text.lastIndexOf('\n', end - 1));
			if (breakPoint > start + chunkSize * 0.5) {
				end = breakPoint + 1;
			}
		}

		const chunk = text.slice(start, end).trim();
		if (chunk.length > 0) {
			chunks.push(chunk);
		}

		if (end >= text.length) break;
		// Guaranteed progress, even when a sentence break shortens the window.
		start = Math.max(end - overlap, start + Math.max(1, Math.floor(chunkSize / 4)));
	}

	return chunks;
}

function validateChunking(chunkSize, overlap) {
	if (!Number.isInteger(chunkSize) || chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE) {
		throw new ValidationError(
			`chunkSize must be an integer between ${MIN_CHUNK_SIZE} and ${MAX_CHUNK_SIZE}`,
			'chunkSize',
		);
	}
	if (!Number.isInteger(overlap) || overlap < 0 || overlap * 2 >= chunkSize) {
		throw new ValidationError('chunkOverlap must be an integer >= 0 and less than half of chunkSize', 'chunkOverlap');
	}
}

const VALID_METADATA_KEY = /^[^.$"][^."]*$/;

function validateMetadata(metadata) {
	for (const [key, value] of Object.entries(metadata)) {
		if (!VALID_METADATA_KEY.test(key)) {
			throw new ValidationError(`metadata key ${JSON.stringify(key)} is not valid for Vectorize`, 'metadata');
		}
		const valid =
			typeof value === 'string' ||
			typeof value === 'number' ||
			typeof value === 'boolean' ||
			(Array.isArray(value) && value.every(item => typeof item === 'string'));
		if (!valid) {
			throw new ValidationError(
				`metadata.${key} must be a string, number, boolean or array of strings`,
				'metadata',
			);
		}
	}
}

/**
 * Chunk, embed and store a document, replacing any earlier version with the same docId.
 * @param {Object} env - Environment with AI and Vectorize bindings
 * @param {string} text - Text to process
 * @param {Object} metadata - Document metadata (must include docId)
 * @param {Object} options - { model, chunkSize, chunkOverlap, namespace }
 * @returns {Promise<Object>} Storage result
 */
export async function processAndStoreDocument(env, text, metadata = {}, options = {}) {
	const {
		model = '@cf/baai/bge-base-en-v1.5',
		chunkSize = 1000,
		chunkOverlap = 200,
		namespace = DEFAULT_NAMESPACE,
	} = options;

	const index = requireIndex(env);
	assertModelMatchesIndex(env, model);
	validateChunking(chunkSize, chunkOverlap);
	validateMetadata(metadata);

	if (text.length > MAX_CHUNKS_PER_DOCUMENT * chunkSize) {
		throw new ValidationError(
			`text is too long: at most ${MAX_CHUNKS_PER_DOCUMENT * chunkSize} characters per document at chunkSize ${chunkSize}`,
			'text',
		);
	}
	const chunks = splitTextIntoChunks(text, chunkSize, chunkOverlap);
	if (chunks.length === 0) {
		throw new ValidationError('text must contain non-whitespace content', 'text');
	}
	if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
		throw new ValidationError(
			`text produces ${chunks.length} chunks; at most ${MAX_CHUNKS_PER_DOCUMENT} are allowed per document`,
			'text',
		);
	}

	const prefix = await documentPrefix(namespace, metadata.docId);
	const createdAt = new Date().toISOString();
	const encoder = new TextEncoder();
	const vectorMetadata = chunks.map((chunk, i) => {
		const meta = { ...metadata, text: chunk, chunkIndex: i, chunkCount: chunks.length, createdAt };
		if (encoder.encode(JSON.stringify(meta)).length > MAX_METADATA_BYTES) {
			throw new ValidationError('metadata is too large: each vector may carry at most 10 KiB of metadata', 'metadata');
		}
		return meta;
	});

	const embeddings = await embedTexts(env, model, chunks);
	assertVectorDimensions(env, model, embeddings);

	// A previous version of this document may have had more chunks than the new one.
	const previousCount = (await getStoredChunkCount(index, prefix)) ?? 0;

	const vectors = chunks.map((_, i) => ({
		id: chunkId(prefix, i),
		values: embeddings[i],
		namespace,
		metadata: vectorMetadata[i],
	}));
	const stored = await storeVectors(index, vectors);

	if (previousCount > chunks.length) {
		const staleIds = [];
		for (let i = chunks.length; i < Math.min(previousCount, MAX_CHUNKS_PER_DOCUMENT); i++) {
			staleIds.push(chunkId(prefix, i));
		}
		await deleteIds(index, staleIds);
	}

	return {
		success: true,
		documentId: metadata.docId,
		chunksProcessed: chunks.length,
		vectorsStored: stored.count,
	};
}

/**
 * Chunk count recorded on the first vector of a stored document, or null when it is not stored.
 */
async function getStoredChunkCount(index, prefix) {
	try {
		const [first] = await index.getByIds([chunkId(prefix, 0)]);
		return first ? Number(first.metadata?.chunkCount) || 1 : null;
	} catch (error) {
		throw wrapVectorizeError('Vectorize lookup failed', error);
	}
}

async function deleteIds(index, ids) {
	try {
		for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
			await index.deleteByIds(ids.slice(i, i + DELETE_BATCH_SIZE));
		}
	} catch (error) {
		throw wrapVectorizeError('Vectorize deletion failed', error);
	}
}

/**
 * Delete every vector of a document.
 * @param {Object} env - Environment with Vectorize binding
 * @param {string} docId
 * @param {string} namespace
 * @returns {Promise<Object>} { found, vectorsDeleted }
 */
export async function deleteDocument(env, docId, namespace = DEFAULT_NAMESPACE) {
	const index = requireIndex(env);
	const prefix = await documentPrefix(namespace, docId);

	const storedCount = await getStoredChunkCount(index, prefix);
	if (storedCount === null) {
		return { found: false, vectorsDeleted: 0 };
	}

	const count = Math.min(Math.max(storedCount, 1), MAX_CHUNKS_PER_DOCUMENT);
	const ids = Array.from({ length: count }, (_, i) => chunkId(prefix, i));
	await deleteIds(index, ids);
	return { found: true, vectorsDeleted: count };
}

/**
 * Perform RAG (Retrieval Augmented Generation) search
 * @param {Object} env - Environment with AI and Vectorize bindings
 * @param {string} query - Search query
 * @param {Object} options - { model, topK, scoreThreshold, namespace }
 * @returns {Promise<Object>} RAG results
 */
export async function performRAGSearch(env, query, options = {}) {
	const {
		model = '@cf/baai/bge-base-en-v1.5',
		topK = 5,
		scoreThreshold = 0.7,
		namespace = DEFAULT_NAMESPACE,
	} = options;

	const index = requireIndex(env);
	assertModelMatchesIndex(env, model);

	const [queryVector] = await embedTexts(env, model, [query]);
	assertVectorDimensions(env, model, [queryVector]);

	const results = await searchVectors(index, queryVector, {
		topK: Math.min(Math.max(topK, 1), MAX_TOP_K),
		scoreThreshold,
		namespace,
	});

	return {
		query,
		context: results.map(result => result.text).join('\n\n'),
		sources: results.map(({ score, metadata, text }) => {
			// The chunk text is returned as a (truncated) preview, not duplicated inside metadata.
			const rest = { ...metadata };
			delete rest.text;
			return {
				score,
				metadata: rest,
				text: text.length > 200 ? text.slice(0, 200) + '...' : text,
			};
		}),
	};
}
