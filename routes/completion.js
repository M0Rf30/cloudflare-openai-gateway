import { MODEL_CONTEXT_WINDOWS, calculateDefaultMaxTokens, resolveModel, isOSSModel } from '../utils/models.js';
import { processThink, extractOSSResponse, estimateTokens, getCORSHeaders } from '../utils/format.js';
import { createCompletionStreamTransformer } from '../utils/stream.js';
import { asyncErrorHandler, ValidationError } from '../utils/errors.js';

export const completionHandler = asyncErrorHandler(async (request, env) => {
	// Get the current time in epoch seconds
	const created = Math.floor(Date.now() / 1000);
	const uuid = crypto.randomUUID();

	if (!request.headers.get('Content-Type')?.includes('application/json')) {
		throw new ValidationError('Invalid request. Content-Type must be application/json');
	}

	const json = await request.json();

	// Resolve model using shared helper
	const model = resolveModel('completion', json?.model, env.MODEL_MAPPER ?? {});

	// Validate prompt
	if (!json?.prompt) {
		throw new ValidationError('prompt is required', 'prompt');
	}

	if (typeof json.prompt !== 'string') {
		throw new ValidationError('prompt must be a string', 'prompt');
	}

	if (json.prompt.length === 0) {
		throw new ValidationError('no prompt provided', 'prompt');
	}

	// Handle streaming
	if (!json?.stream) json.stream = false;

	// Handle max_tokens parameter with reasonable defaults and limits
	const contextWindow = MODEL_CONTEXT_WINDOWS[model] || 4096;

	let maxTokens;
	if (typeof json.max_tokens === 'number' && json.max_tokens > 0) {
		// Use provided value if it's a valid number (clamped to context window)
		maxTokens = Math.max(1, Math.min(json.max_tokens, contextWindow));
	} else {
		// Use our helper function to calculate a sensible default
		maxTokens = calculateDefaultMaxTokens(model);
	}

	// Handle other generation parameters
	const temperature =
		json?.temperature && typeof json.temperature === 'number'
			? Math.max(0, Math.min(json.temperature, 2)) // Clamp between 0 and 2
			: 0.7; // Default temperature

	const topP =
		json?.top_p && typeof json.top_p === 'number'
			? Math.max(0, Math.min(json.top_p, 1)) // Clamp between 0 and 1
			: 0.9; // Default top_p

	// Store the response model name (what client sent or resolved model)
	const responseModel = json.model || model;

	// Handle streaming response
	if (json.stream) {
		const transformer = createCompletionStreamTransformer(uuid, created, responseModel);

		// Prepare AI parameters
		const aiParams = {
			stream: json.stream,
			max_tokens: maxTokens,
			temperature,
			top_p: topP,
		};

		// Special handling for OpenAI OSS models that require 'input' instead of 'prompt'
		if (isOSSModel(model)) {
			aiParams.input = json.prompt;
		} else {
			aiParams.prompt = json.prompt;
		}

		// Run the AI model with configured parameters
		const aiResp = await env.AI.run(model, aiParams);

		// Return streaming response
		return new Response(aiResp.pipeThrough(transformer), {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
				...getCORSHeaders(),
			},
		});
	} else {
		// Non-streaming response
		// Prepare AI parameters
		const aiParams = {
			max_tokens: maxTokens,
			temperature,
			top_p: topP,
		};

		// Special handling for OpenAI OSS models that require 'input' instead of 'prompt'
		if (isOSSModel(model)) {
			aiParams.input = json.prompt;
		} else {
			aiParams.prompt = json.prompt;
		}

		// Run the AI model with configured parameters
		const aiResp = await env.AI.run(model, aiParams);

		// Extract response text using shared helper
		let responseText;
		if (isOSSModel(model)) {
			responseText = extractOSSResponse(aiResp);
		} else {
			responseText = aiResp.response || '';
		}

		const finalResponseText = processThink(responseText);

		// Estimate token usage
		const promptTokens = estimateTokens(json.prompt);
		const completionTokens = estimateTokens(finalResponseText);

		return Response.json({
			id: uuid,
			model: responseModel,
			created,
			object: 'text_completion',
			choices: [
				{
					index: 0,
					finish_reason: 'stop',
					text: finalResponseText,
					logprobs: null,
				},
			],
			usage: {
				prompt_tokens: promptTokens,
				completion_tokens: completionTokens,
				total_tokens: promptTokens + completionTokens,
			},
		});
	}
});
