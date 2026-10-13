import { resolveModel } from '../utils/models.js';
import { processThink, estimateTokens, normalizeAIResponse } from '../utils/format.js';
import { createCompletionStreamTransformer } from '../utils/stream.js';
import { applyStop, newResponseId, resolveGenerationParams } from '../utils/generation.js';
import { asyncErrorHandler, ValidationError } from '../utils/errors.js';

const IMPLICIT_THINK_MODELS = /deepseek-r1|qwq/i;

export const completionHandler = asyncErrorHandler(async (request, env) => {
	// Get the current time in epoch seconds
	const created = Math.floor(Date.now() / 1000);
	const id = newResponseId('cmpl');

	if (!request.headers.get('Content-Type')?.includes('application/json')) {
		throw new ValidationError('Invalid request. Content-Type must be application/json');
	}

	const json = await request.json();

	// Resolve model using shared helper
	const model = resolveModel('completion', json?.model);

	// Validate prompt
	if (!json?.prompt) {
		throw new ValidationError('prompt is required', 'prompt');
	}

	if (typeof json.prompt !== 'string') {
		throw new ValidationError('prompt must be a string', 'prompt');
	}

	const stream = json.stream === true;
	const { maxTokens, params, stop, includeUsage } = resolveGenerationParams(json, model);

	// Store the response model name (what client sent or resolved model)
	const responseModel = json.model || model;
	const promptTokens = estimateTokens(json.prompt);

	// Run the AI model with configured parameters
	const aiResp = await env.AI.run(model, { prompt: json.prompt, stream, ...params });

	if (stream) {
		const transformer = createCompletionStreamTransformer(id, created, responseModel, {
			includeUsage,
			stop,
			implicitThink: IMPLICIT_THINK_MODELS.test(model),
			maxTokens,
			promptTokens,
		});

		return new Response(aiResp.pipeThrough(transformer), {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
			},
		});
	}

	// Non-streaming response
	const normalized = normalizeAIResponse(aiResp);
	const { text: finalResponseText, stopped } = applyStop(processThink(normalized.text), stop);

	const completionTokens = normalized.usage?.completion_tokens ?? estimateTokens(finalResponseText);
	const usage = normalized.usage ?? {
		prompt_tokens: promptTokens,
		completion_tokens: completionTokens,
		total_tokens: promptTokens + completionTokens,
	};

	const hitLimit = normalized.finishReason === 'length' || (normalized.usage && completionTokens >= maxTokens);

	return Response.json({
		id,
		model: responseModel,
		created,
		object: 'text_completion',
		choices: [
			{
				index: 0,
				finish_reason: !stopped && hitLimit ? 'length' : 'stop',
				text: finalResponseText,
				logprobs: null,
			},
		],
		usage,
	});
});
