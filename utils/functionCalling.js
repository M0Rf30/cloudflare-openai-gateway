import { contentToText } from './format.js';

const newToolCallId = () => `call_${crypto.randomUUID().replace(/-/g, '')}`;

/**
 * Convert tool-related messages to plain text messages for models WITHOUT native
 * function calling. Does not mutate the input.
 * @param {Array} messages - Conversation messages
 * @returns {Array} Processed messages
 */
export function processFunctionMessages(messages) {
	const processedMessages = [];

	for (const message of messages) {
		if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
			let content = contentToText(message.content);

			for (const toolCall of message.tool_calls) {
				if (toolCall.type === 'function' && toolCall.function) {
					content += `\n\nFunction Call: ${toolCall.function.name}\nArguments: ${toolCall.function.arguments}`;
				}
			}

			processedMessages.push({ role: 'assistant', content: content.trim() });
		} else if (message.role === 'tool') {
			processedMessages.push({
				role: 'user',
				content: `Function Result for ${message.tool_call_id ?? message.name ?? 'tool'}: ${contentToText(message.content)}`,
			});
		} else if (message.role === 'function') {
			// Legacy function calling format
			processedMessages.push({
				role: 'user',
				content: `Function Result for ${message.name}: ${contentToText(message.content)}`,
			});
		} else {
			processedMessages.push(message);
		}
	}

	return processedMessages;
}

/**
 * Normalize tool-related messages for models WITH native function calling:
 * assistant `content: null` becomes an empty string, tool results are flattened
 * to text and carry the tool `name` (resolved from the matching assistant
 * tool_call), and legacy `function` role messages become `tool` messages.
 * Does not mutate the input.
 * @param {Array} messages - Conversation messages
 * @returns {Array} Normalized messages
 */
export function normalizeToolMessages(messages) {
	const namesById = new Map();
	for (const message of messages) {
		if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
			for (const call of message.tool_calls) {
				if (call?.id && call.function?.name) namesById.set(call.id, call.function.name);
			}
		}
	}

	return messages.map(message => {
		if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
			return { ...message, content: contentToText(message.content) };
		}
		if (message.role === 'tool') {
			return {
				role: 'tool',
				name: message.name ?? namesById.get(message.tool_call_id),
				tool_call_id: message.tool_call_id,
				content: contentToText(message.content),
			};
		}
		if (message.role === 'function') {
			return { role: 'tool', name: message.name, content: contentToText(message.content) };
		}
		return message;
	});
}

/**
 * Add function definitions to the system message (prompt-injection fallback for
 * models without native function calling). Does not mutate the input messages.
 * @param {Array} messages - Conversation messages
 * @param {Array} tools - Available tools/functions
 * @returns {Array} Messages with function context
 */
export function addFunctionContext(messages, tools = []) {
	if (!tools || tools.length === 0) {
		return messages;
	}

	const functionDefs = tools
		.map(tool => {
			if (tool.type === 'function') {
				const func = tool.function;
				return `Function: ${func.name}
Description: ${func.description || 'No description provided'}
Parameters: ${JSON.stringify(func.parameters || {})}`;
			}
			return '';
		})
		.filter(def => def)
		.join('\n\n');

	const functionPrompt = `You have access to the following functions. When you need to call a function, respond with a JSON object containing "function_call" with "name" and "arguments" fields:

${functionDefs}

Example function call format:
{
  "function_call": {
    "name": "function_name",
    "arguments": {"param1": "value1", "param2": "value2"}
  }
}

If you're not calling a function, respond normally with your message.`;

	const updatedMessages = [...messages];
	const systemMessageIndex = updatedMessages.findIndex(msg => msg.role === 'system');

	if (systemMessageIndex >= 0) {
		const system = updatedMessages[systemMessageIndex];
		updatedMessages[systemMessageIndex] = {
			...system,
			content: `${contentToText(system.content)}\n\n${functionPrompt}`,
		};
	} else {
		updatedMessages.unshift({ role: 'system', content: functionPrompt });
	}

	return updatedMessages;
}

/**
 * Find the end of the balanced JSON object starting at `start` (string/escape aware).
 * @param {string} text
 * @param {number} start - Index of '{'
 * @returns {number} Index one past the closing '}', or -1 when unbalanced
 */
function findBalancedObjectEnd(text, start) {
	let depth = 0;
	let inString = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (ch === '\\') i++;
			else if (ch === '"') inString = false;
		} else if (ch === '"') {
			inString = true;
		} else if (ch === '{') {
			depth++;
		} else if (ch === '}') {
			depth--;
			if (depth === 0) return i + 1;
		}
	}
	return -1;
}

/**
 * Parse AI response for a prompt-injected function call.
 * Scans every balanced `{…}` segment so surrounding prose containing braces
 * doesn't break detection.
 * @param {string} content - AI response content
 * @returns {{hasFunction: boolean, functionCall: (Object|null), content: string}}
 */
export function parseFunctionCall(content) {
	if (typeof content === 'string') {
		let from = content.indexOf('{');
		while (from !== -1) {
			const end = findBalancedObjectEnd(content, from);
			if (end !== -1) {
				try {
					const parsed = JSON.parse(content.slice(from, end));
					if (parsed?.function_call?.name) {
						return {
							hasFunction: true,
							functionCall: parsed.function_call,
							content: (content.slice(0, from) + content.slice(end)).trim(),
						};
					}
				} catch {
					// not JSON, try the next '{'
				}
			}
			from = content.indexOf('{', from + 1);
		}
	}

	return { hasFunction: false, functionCall: null, content };
}

/**
 * Build an OpenAI assistant message with tool_calls.
 * @param {Array<{id: (string|null), name: string, arguments: (string|Object)}>} calls
 * @param {string|null} content
 * @returns {Object}
 */
export function formatToolCallsMessage(calls, content) {
	return {
		role: 'assistant',
		content: content || null,
		tool_calls: calls.map(call => ({
			id: call.id || newToolCallId(),
			type: 'function',
			function: {
				name: call.name,
				arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments ?? {}),
			},
		})),
	};
}

/**
 * Convert a single parsed function call to an OpenAI assistant message.
 * @param {Object} functionCall - Function call from AI
 * @param {string} content - Response content
 * @returns {Object} OpenAI formatted message
 */
export function formatFunctionCallResponse(functionCall, content) {
	return formatToolCallsMessage([functionCall], content);
}
