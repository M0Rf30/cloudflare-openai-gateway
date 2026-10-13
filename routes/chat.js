import { generateCacheKey, cacheResponse, getCachedResponse, shouldCache } from '../utils/cache.js';
import { convertImageToDataURL } from '../utils/converters.js';
import {
	processFunctionMessages,
	normalizeToolMessages,
	addFunctionContext,
	parseFunctionCall,
	formatToolCallsMessage,
} from '../utils/functionCalling.js';
import { MODEL_CAPABILITIES, resolveModel } from '../utils/models.js';
import { processThink, estimateTokens, contentToText, normalizeAIResponse } from '../utils/format.js';
import { createChatStreamTransformer, chatResultToStream } from '../utils/stream.js';
import { applyStop, newResponseId, resolveGenerationParams } from '../utils/generation.js';
import { asyncErrorHandler, ValidationError } from '../utils/errors.js';

// Helper function to process messages with potential image content
async function processMultimodalMessages(messages) {
	return Promise.all(
		messages.map(async message => {
			// If content is a string, return as is
			if (typeof message.content === 'string') {
				return message;
			}

			const processItem = async item => {
				if (item.type === 'text') {
					return item;
				}

				if (item.type === 'image_url') {
					if (typeof item.image_url?.url === 'string') {
						// Handle data URLs directly
						if (item.image_url.url.startsWith('data:')) {
							return item;
						}
						// Handle HTTP/HTTPS URLs by fetching and converting to data URL
						else if (item.image_url.url.startsWith('http')) {
							try {
								// Validate the URL before fetching
								new URL(item.image_url.url);

								const dataUrl = await convertImageToDataURL(item.image_url.url);
								return {
									type: 'image_url',
									image_url: {
										url: dataUrl,
									},
								};
							} catch (error) {
								console.error('Error fetching image URL:', error);
								throw new ValidationError('Image URL must be a data URI or a valid HTTP/HTTPS URL.');
							}
						}
					}
					throw new ValidationError('Image URL must be a data URI or a valid HTTP/HTTPS URL.');
				}
				return item;
			};

			// If content is an array, process each item
			if (Array.isArray(message.content)) {
				const processedContent = await Promise.all(message.content.map(processItem));
				return {
					...message,
					content: processedContent,
				};
			}

			// Handle object content with type property
			if (typeof message.content === 'object' && message.content !== null) {
				const processedContent = await processItem(message.content);
				return {
					...message,
					content: processedContent,
				};
			}

			return message;
		}),
	);
}

const IMPLICIT_THINK_MODELS = /deepseek-r1|qwq/i;

/** Resolve tool_choice: returns the tools to expose (null = none). */
function selectTools(tools, toolChoice) {
	if (!tools) return null;
	if (toolChoice === 'none') return null;
	const forced = toolChoice?.type === 'function' ? toolChoice.function?.name : toolChoice?.name;
	if (forced) {
		const match = tools.filter(tool => tool.function.name === forced);
		if (match.length === 0) {
			throw new ValidationError(`tool_choice references unknown function: ${forced}`, 'tool_choice');
		}
		return match;
	}
	return tools;
}

function estimatePromptTokens(messages, tools) {
	let tokens = 0;
	for (const message of messages) {
		tokens += estimateTokens(contentToText(message.content));
	}
	if (tools) tokens += estimateTokens(JSON.stringify(tools));
	return tokens;
}

export const chatHandler = asyncErrorHandler(async (request, env) => {
	// get the current time in epoch seconds
	const created = Math.floor(Date.now() / 1000);
	const id = newResponseId('chatcmpl');

	if (!request.headers.get('Content-Type')?.includes('application/json')) {
		throw new ValidationError('Invalid request. Content-Type must be application/json');
	}

	const json = await request.json();

	// Resolve model using shared helper
	const model = resolveModel('chat', json?.model);

	if (!json?.messages || !Array.isArray(json.messages) || json.messages.length === 0) {
		throw new ValidationError('messages are required and must be a non-empty array', 'messages');
	}

	const stream = json.stream === true;
	const { maxTokens, params, stop, includeUsage } = resolveGenerationParams(json, model);

	// Handle function calling
	let tools = null;
	let toolChoice = null;
	if (json?.tools && Array.isArray(json.tools)) {
		tools = json.tools;
		toolChoice = json?.tool_choice ?? 'auto';

		for (const tool of tools) {
			if (tool.type !== 'function') {
				throw new ValidationError(`Unsupported tool type: ${tool.type}. Only 'function' is supported.`, 'tools');
			}
			if (!tool.function?.name) {
				throw new ValidationError('Tool function must have a name', 'tools');
			}
		}
	}

	// Legacy function calling support
	if (json?.functions && Array.isArray(json.functions)) {
		tools = json.functions.map(func => ({
			type: 'function',
			function: func,
		}));
		toolChoice = json?.function_call ?? 'auto';
	}

	tools = selectTools(tools, toolChoice);
	if (tools && tools.length === 0) tools = null;

	// Process messages for multimodal content (single pass: remote images are fetched once)
	let processedMessages = await processMultimodalMessages(json.messages);

	// Native function calling when the model supports it, prompt injection otherwise.
	// Tool / tool_calls history messages are always converted to something the model accepts.
	const nativeTools = MODEL_CAPABILITIES[model]?.includes('function-calling') === true;
	if (nativeTools) {
		processedMessages = normalizeToolMessages(processedMessages);
	} else {
		processedMessages = processFunctionMessages(processedMessages);
		if (tools) processedMessages = addFunctionContext(processedMessages, tools);
	}

	// Prompt-injected function calls can only be recognised in the full text, so those
	// requests run non-streaming upstream and are replayed as SSE.
	const streamUpstream = stream && !(tools && !nativeTools);

	const aiParams = {
		messages: processedMessages,
		stream: streamUpstream,
		...params,
	};
	if (tools && nativeTools) aiParams.tools = tools;

	const promptTokens = estimatePromptTokens(processedMessages, tools && nativeTools ? tools : null);

	// Check cache for non-streaming requests (don't cache function calls)
	let cacheKey = null;
	if (env.CACHE_KV && shouldCache(aiParams) && !tools) {
		cacheKey = await generateCacheKey(model, processedMessages, { ...params, stop });
		const cachedResponse = await getCachedResponse(env.CACHE_KV, cacheKey);

		if (cachedResponse) {
			return Response.json({
				...cachedResponse,
				id,
				model: json.model || model,
				created,
			});
		}
	}

	// Run the AI model
	const aiResp = await env.AI.run(model, aiParams);

	// Use the model name the client sent (for response compatibility)
	const responseModel = json.model || model;

	// Handle streaming response
	if (streamUpstream) {
		const transformer = createChatStreamTransformer(id, created, responseModel, {
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

	// Non-streaming: normalize whatever shape the model returned
	const normalized = normalizeAIResponse(aiResp);
	let content = processThink(normalized.text);

	let toolCalls = [];
	if (tools) {
		if (nativeTools) {
			toolCalls = normalized.toolCalls;
		} else {
			const parsed = parseFunctionCall(content);
			if (parsed.hasFunction) {
				toolCalls = [parsed.functionCall];
				content = parsed.content;
			}
		}
	}

	let stopped = false;
	if (toolCalls.length === 0) {
		({ text: content, stopped } = applyStop(content, stop));
	}

	const usage =
		normalized.usage ??
		(() => {
			const completionTokens = estimateTokens(content);
			return {
				prompt_tokens: promptTokens,
				completion_tokens: completionTokens,
				total_tokens: promptTokens + completionTokens,
			};
		})();

	let finishReason = 'stop';
	if (toolCalls.length > 0) {
		finishReason = 'tool_calls';
	} else if (!stopped && (normalized.finishReason === 'length' || (normalized.usage && usage.completion_tokens >= maxTokens))) {
		finishReason = 'length';
	}

	const message =
		toolCalls.length > 0 ? formatToolCallsMessage(toolCalls, content) : { role: 'assistant', content };

	if (stream) {
		// prompt-injected tool calling requested with stream: true
		return new Response(chatResultToStream(id, created, responseModel, message, finishReason, usage, includeUsage), {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
			},
		});
	}

	const response = {
		id,
		model: responseModel,
		created,
		object: 'chat.completion',
		choices: [{ index: 0, message, finish_reason: finishReason }],
		usage,
	};

	// Cache the response if caching is enabled (don't cache function calls)
	if (env.CACHE_KV && cacheKey && toolCalls.length === 0) {
		const cacheTtl =
			env.CACHE_TTL_SECONDS && parseInt(env.CACHE_TTL_SECONDS) > 0 ? parseInt(env.CACHE_TTL_SECONDS) : 3600;
		await cacheResponse(env.CACHE_KV, cacheKey, response, cacheTtl);
	}

	return Response.json(response);
});
