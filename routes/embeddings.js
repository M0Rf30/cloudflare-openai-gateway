import {
	EMBEDDING_DIMENSIONS,
	embedTexts,
	getEmbeddingBatchLimit,
	storeVectors,
} from '../utils/vectorize.js';
import { arrayBufferToBase64 } from '../utils/format.js';
import { resolveModel } from '../utils/models.js';
import { asyncErrorHandler, ValidationError } from '../utils/errors.js';

/** Float32 little-endian base64, the encoding OpenAI SDKs decode for encoding_format "base64". */
function encodeFloat32Base64(embedding) {
	return arrayBufferToBase64(new Float32Array(embedding).buffer);
}

export const embeddingsHandler = asyncErrorHandler(async (request, env) => {
	// Check for proper content type
	if (!request.headers.get('Content-Type')?.includes('application/json')) {
		throw new ValidationError('Content-Type must be application/json');
	}

	const json = await request.json();

	// Validate required fields
	if (!json?.input) {
		throw new ValidationError('Missing required field: input', 'input');
	}

	// Handle model selection - support both OpenAI and Cloudflare model names
	const model = resolveModel('embeddings', json.model);

	// Handle pooling method (Cloudflare specific feature; only the bge-*-en-v1.5 models use it)
	const pooling = ['mean', 'cls'].includes(json.pooling) ? json.pooling : 'mean';

	const encodingFormat = json.encoding_format ?? 'float';
	if (encodingFormat !== 'float' && encodingFormat !== 'base64') {
		throw new ValidationError('encoding_format must be "float" or "base64"', 'encoding_format');
	}

	// Workers AI embedding models have a fixed output size and no truncation parameter.
	if (json.dimensions !== undefined && json.dimensions !== null) {
		const native = EMBEDDING_DIMENSIONS[model];
		if (json.dimensions !== native) {
			throw new ValidationError(
				native
					? `${model} only produces ${native}-dimensional embeddings; dimensions=${json.dimensions} is not supported`
					: `dimensions is not supported by ${model}`,
				'dimensions',
			);
		}
	}

	// Prepare input text
	const inputText = typeof json.input === 'string' ? [json.input] : json.input;

	// Ensure input is in the correct format
	if (!Array.isArray(inputText)) {
		throw new ValidationError('Input must be a string or array of strings', 'input');
	}

	// Validate input length
	if (inputText.length === 0) {
		throw new ValidationError('Input cannot be empty', 'input');
	}

	// Batch limits differ per model (e.g. 32 for qwen3-embedding, 100 for bge)
	const batchLimit = getEmbeddingBatchLimit(model);
	if (inputText.length > batchLimit) {
		throw new ValidationError(`Batch size cannot exceed ${batchLimit} items for ${model}`, 'input');
	}

	// Validate each text item
	for (const text of inputText) {
		if (typeof text !== 'string' || text.trim().length === 0) {
			throw new ValidationError('All input items must be non-empty strings', 'input');
		}
	}

	// Call Cloudflare Workers AI
	const vectors = await embedTexts(env, model, inputText, { pooling });

	// Optional: Store embeddings in Vectorize if configured and metadata provided
	if (env.VECTOR_INDEX && json.store_in_vectorize && json.metadata) {
		try {
			await storeVectors(
				env.VECTOR_INDEX,
				vectors.map((embedding, index) => ({
					id: json.metadata.ids?.[index] || crypto.randomUUID(),
					values: embedding,
					metadata: {
						...json.metadata.common,
						...(json.metadata.individual?.[index] || {}),
						text: inputText[index],
						model,
						createdAt: new Date().toISOString(),
					},
				})),
			);
		} catch (vectorizeError) {
			console.error('Failed to store in Vectorize:', vectorizeError);
			// Continue with the response even if Vectorize storage fails
		}
	}

	// Calculate approximate token usage
	const totalTokens = inputText.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);

	// Format response to match OpenAI API structure
	const data = vectors.map((embedding, index) => ({
		object: 'embedding',
		embedding: encodingFormat === 'base64' ? encodeFloat32Base64(embedding) : embedding,
		index,
	}));

	return Response.json({
		object: 'list',
		data,
		model: json.model || model,
		usage: {
			prompt_tokens: totalTokens,
			total_tokens: totalTokens,
		},
	});
});
