import { generateCacheKey, cacheResponse, getCachedResponse, shouldCache } from '../utils/cache.js';
import { convertImageToDataURL } from '../utils/converters.js';
import {
	processFunctionMessages,
	addFunctionContext,
	parseFunctionCall,
	formatFunctionCallResponse,
} from '../utils/functionCalling.js';
import { MODEL_CONTEXT_WINDOWS, MODEL_CAPABILITIES, resolveModel, isOSSModel } from '../utils/models.js';
import { processThink, extractOSSResponse, estimateTokens, getCORSHeaders } from '../utils/format.js';
import { createChatStreamTransformer } from '../utils/stream.js';
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

export const chatHandler = asyncErrorHandler(async (request, env) => {
	// get the current time in epoch seconds
	const created = Math.floor(Date.now() / 1000);
	const uuid = crypto.randomUUID();

	if (!request.headers.get('Content-Type')?.includes('application/json')) {
		throw new ValidationError('Invalid request. Content-Type must be application/json');
	}

	const json = await request.json();

	// Resolve model using shared helper
	const model = resolveModel('chat', json?.model);

	if (!json?.messages || !Array.isArray(json.messages) || json.messages.length === 0) {
		throw new ValidationError('messages are required and must be a non-empty array', 'messages');
	}

	const messages = json.messages;
	if (!json?.stream) json.stream = false;

	// Get model configuration and context window
	const context_window = MODEL_CONTEXT_WINDOWS[model];

	// Handle max_tokens parameter with reasonable defaults and limits
	let max_tokens = 1024; // Fallback default
	if (typeof json.max_tokens === 'number' && json.max_tokens > 0) {
		max_tokens = Math.min(json.max_tokens, context_window);
	} else {
		max_tokens = Math.min(Math.floor(context_window * 0.7), 16384);
	}
	max_tokens = Math.max(10, max_tokens);

	// Handle other generation parameters
	const temperature =
		json?.temperature && typeof json.temperature === 'number' ? Math.max(0, Math.min(json.temperature, 2)) : 0.7;

	const topP = json?.top_p && typeof json.top_p === 'number' ? Math.max(0, Math.min(json.top_p, 1)) : 0.9;

	// Handle function calling
	let tools = null;
	let toolChoice = null;
	if (json?.tools && Array.isArray(json.tools)) {
		tools = json.tools;
		toolChoice = json?.tool_choice || 'auto';

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
		toolChoice = json?.function_call || 'auto';
	}

	// Prepare AI parameters
	let processedMessages = messages;
	const aiParams = {
		stream: json.stream,
		max_tokens,
		temperature,
		topP,
	};

	// Store original messages before any processing that might be skipped
	const originalMessages = [...messages];

	// Process messages for multimodal content
	processedMessages = await processMultimodalMessages(originalMessages);

	// Determine if the model supports function calling
	const modelSupportsFunctionCalling = MODEL_CAPABILITIES[model]?.includes('function-calling');

	// Handle function calling logic
	if (tools) {
		if (modelSupportsFunctionCalling) {
			processedMessages = processFunctionMessages(processedMessages, tools);
			processedMessages = addFunctionContext(processedMessages, tools);
		} else {
			tools = null;
			toolChoice = null;
			processedMessages = await processMultimodalMessages(originalMessages, model);
		}
	}

	// Special handling for OpenAI OSS models that require 'input' instead of 'messages'
	if (isOSSModel(model)) {
		let inputText = '';
		for (const message of processedMessages) {
			if (message.role === 'system') {
				inputText += `[SYSTEM] ${message.content}\n`;
			} else if (message.role === 'user') {
				inputText += `[USER] ${message.content}\n`;
			} else if (message.role === 'assistant') {
				inputText += `[ASSISTANT] ${message.content}\n`;
			}
		}
		aiParams.input = inputText.trim();
		delete aiParams.tools;
		delete aiParams.tool_choice;
	} else {
		aiParams.messages = processedMessages;
		if (tools) {
			aiParams.tools = tools;
			aiParams.tool_choice = toolChoice;
		}
	}

	// Check cache for non-streaming requests (don't cache function calls)
	let cacheKey = null;
	if (env.CACHE_KV && shouldCache(aiParams) && !tools) {
		cacheKey = await generateCacheKey(model, processedMessages, aiParams);
		const cachedResponse = await getCachedResponse(env.CACHE_KV, cacheKey);

		if (cachedResponse) {
			return Response.json({
				...cachedResponse,
				id: uuid,
				created,
			});
		}
	}

	// Ensure max_tokens is a valid integer for the Cloudflare backend
	const finalParams = { ...aiParams };
	if (finalParams.max_tokens === undefined || finalParams.max_tokens === null) {
		finalParams.max_tokens = Math.floor(context_window * 0.7);
	}

	// Run the AI model
	const aiResp = await env.AI.run(model, finalParams);

	// Use the model name the client sent (for response compatibility)
	const responseModel = json.model || model;

	// Handle streaming response
	if (json.stream) {
		const transformer = createChatStreamTransformer(uuid, created, responseModel);
		return new Response(aiResp.pipeThrough(transformer), {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
				...getCORSHeaders(),
			},
		});
	}

	// Non-streaming: extract content
	let contentToProcess;
	if (isOSSModel(model)) {
		contentToProcess = extractOSSResponse(aiResp);
	} else if (typeof aiResp === 'object' && aiResp !== null && 'response' in aiResp) {
		contentToProcess = aiResp.response;
	} else {
		contentToProcess = aiResp;
	}

	const { hasFunction, functionCall, content } = parseFunctionCall(contentToProcess);

	// Estimate token usage
	const promptText = processedMessages.map(m => (typeof m.content === 'string' ? m.content : '')).join(' ');
	const promptTokens = estimateTokens(promptText);
	const completionTokens = estimateTokens(typeof content === 'string' ? content : '');

	let response;
	if (hasFunction && tools) {
		const message = formatFunctionCallResponse(functionCall, content);
		response = {
			id: uuid,
			model: responseModel,
			created,
			object: 'chat.completion',
			choices: [
				{
					index: 0,
					message,
					finish_reason: 'tool_calls',
				},
			],
			usage: {
				prompt_tokens: promptTokens,
				completion_tokens: completionTokens,
				total_tokens: promptTokens + completionTokens,
			},
		};
	} else {
		const finalContent = processThink(content);
		const finalCompletionTokens = estimateTokens(typeof finalContent === 'string' ? finalContent : '');
		response = {
			id: uuid,
			model: responseModel,
			created,
			object: 'chat.completion',
			choices: [
				{
					index: 0,
					message: {
						role: 'assistant',
						content: finalContent,
					},
					finish_reason: 'stop',
				},
			],
			usage: {
				prompt_tokens: promptTokens,
				completion_tokens: finalCompletionTokens,
				total_tokens: promptTokens + finalCompletionTokens,
			},
		};
	}

	// Cache the response if caching is enabled (don't cache function calls)
	if (env.CACHE_KV && cacheKey && shouldCache(aiParams) && !hasFunction) {
		const cacheTtl =
			env.CACHE_TTL_SECONDS && parseInt(env.CACHE_TTL_SECONDS) > 0 ? parseInt(env.CACHE_TTL_SECONDS) : 3600;
		await cacheResponse(env.CACHE_KV, cacheKey, response, cacheTtl);
	}

	return Response.json(response);
});
