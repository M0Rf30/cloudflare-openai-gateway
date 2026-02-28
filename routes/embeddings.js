import { storeVectors } from '../utils/vectorize.js';
import { MODEL_CATEGORIES, resolveModel } from '../utils/models.js';
import { asyncErrorHandler, ValidationError } from '../utils/errors.js';

export const embeddingsHandler = asyncErrorHandler(async (request, env) => {
	let model = '@cf/baai/bge-base-en-v1.5';
	let pooling = 'mean';

	try {
		// Check for proper content type
		if (!request.headers.get('Content-Type')?.includes('application/json')) {
			throw new ValidationError('Content-Type must be application/json');
		}

		const json = await request.json();

		// Validate required fields
		if (!json.input) {
			throw new ValidationError('Missing required field: input');
		}

		// Handle model selection - support both OpenAI and Cloudflare model names
		if (json.model) {
			model = resolveModel('embeddings', json.model);
		}

		// Handle pooling method (Cloudflare specific feature)
		if (json.pooling && ['mean', 'cls'].includes(json.pooling)) {
			pooling = json.pooling;
		}

		// Prepare input text
		let inputText = json.input;

		// Ensure input is in the correct format
		if (typeof inputText === 'string') {
			inputText = [inputText];
		} else if (!Array.isArray(inputText)) {
			throw new ValidationError('Input must be a string or array of strings');
		}

		// Validate input length
		if (inputText.length === 0) {
			throw new ValidationError('Input cannot be empty');
		}

		// Check for batch size limits (Cloudflare supports up to 100 items)
		if (inputText.length > 100) {
			throw new ValidationError('Batch size cannot exceed 100 items');
		}

		// Validate each text item
		for (const text of inputText) {
			if (typeof text !== 'string' || text.trim().length === 0) {
				throw new ValidationError('All input items must be non-empty strings');
			}
		}

		// Call Cloudflare Workers AI
		const embeddings = await env.AI.run(model, {
			text: inputText,
			pooling,
		});

		// Optional: Store embeddings in Vectorize if configured and metadata provided
		if (env.VECTOR_INDEX && json.store_in_vectorize && json.metadata) {
			try {
				const vectors = embeddings.data.map((embedding, index) => ({
					id: json.metadata.ids?.[index] || `${Date.now()}_${index}`,
					values: embedding,
					metadata: {
						...json.metadata.common,
						...(json.metadata.individual?.[index] || {}),
						text: inputText[index],
						model,
						createdAt: new Date().toISOString(),
					},
				}));

				await storeVectors(env.VECTOR_INDEX, vectors);
			} catch (vectorizeError) {
				console.error('Failed to store in Vectorize:', vectorizeError);
				// Continue with the response even if Vectorize storage fails
			}
		}

		// Calculate approximate token usage
		const totalTokens = inputText.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);

		// Format response to match OpenAI API structure
		const data = embeddings.data.map((embedding, index) => ({
			object: 'embedding',
			embedding,
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
	} catch (e) {
		console.error('Embeddings error:', e);

		// Handle specific Cloudflare AI errors
		if (e.message?.includes('rate limit')) {
			return Response.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
		}

		if (e.message?.includes('invalid input')) {
			return Response.json({ error: 'Invalid input format or content' }, { status: 400 });
		}

		// Re-throw to let asyncErrorHandler process it
		throw e;
	}
});

// Optional: Add a simple health check endpoint
export const healthHandler = async (_request, _env) => {
	return Response.json({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		models: MODEL_CATEGORIES.embeddings,
	});
};
