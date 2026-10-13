// Response formatting utilities for OpenAI-compatible API

/**
 * Convert an ArrayBuffer / typed array to a base64 string.
 * Chunked so large buffers don't blow the call stack or the 10ms CPU budget
 * with millions of string appends. This is the single shared encoder.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

// Helper function to create segments from words
export function createSegmentsFromWords(words) {
	if (!words || words.length === 0) return [];

	const segments = [];
	let currentSegment = {
		id: 0,
		start: words[0].start,
		end: words[0].end,
		text: '',
	};

	words.forEach((wordData, index) => {
		currentSegment.text += (currentSegment.text ? ' ' : '') + wordData.word;
		currentSegment.end = wordData.end;

		// Create new segment on sentence end or every 10 words
		if (
			wordData.word.endsWith('.') ||
			wordData.word.endsWith('!') ||
			wordData.word.endsWith('?') ||
			index % 10 === 9 ||
			index === words.length - 1
		) {
			segments.push({ ...currentSegment });
			if (index < words.length - 1) {
				currentSegment = {
					id: segments.length,
					start: words[index + 1].start,
					end: words[index + 1].end,
					text: '',
				};
			}
		}
	});

	return segments;
}

// Utility function to process and remove <think> tags from response
export function processThink(responseText) {
	if (typeof responseText !== 'string') {
		return responseText;
	}
	const thinkTagEnd = '</think>';
	const thinkIndex = responseText.indexOf(thinkTagEnd);
	if (thinkIndex !== -1) {
		return responseText.substring(thinkIndex + thinkTagEnd.length).trim();
	}
	return responseText;
}

// Utility function to estimate token count
export function estimateTokens(text) {
	if (!text) return 0;
	// Rough estimation: ~4 characters per token
	return Math.ceil(text.length / 4);
}

/**
 * Join the text parts of an OpenAI-style message content (string | parts array).
 * @param {*} content
 * @returns {string}
 */
export function contentToText(content) {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map(part => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
			.join('');
	}
	if (content && typeof content === 'object' && typeof content.text === 'string') return content.text;
	return '';
}

function normalizeUsage(usage) {
	if (!usage || typeof usage !== 'object') return null;
	const prompt = usage.prompt_tokens ?? usage.input_tokens;
	const completion = usage.completion_tokens ?? usage.output_tokens;
	if (typeof prompt !== 'number' && typeof completion !== 'number') return null;
	const p = prompt || 0;
	const c = completion || 0;
	return { prompt_tokens: p, completion_tokens: c, total_tokens: usage.total_tokens ?? p + c };
}

/**
 * Normalize a native Workers AI tool call or an OpenAI-style one to
 * `{ id, name, arguments }` where `arguments` is a JSON string.
 * @param {Object} call
 * @returns {{id: (string|null), name: string, arguments: string}|null}
 */
export function normalizeToolCall(call) {
	if (!call || typeof call !== 'object') return null;
	const fn = call.function && typeof call.function === 'object' ? call.function : call;
	const name = fn.name;
	if (typeof name !== 'string' || !name) return null;
	const args = fn.arguments ?? fn.parameters ?? {};
	return {
		id: call.id ?? call.call_id ?? null,
		name,
		arguments: typeof args === 'string' ? args : JSON.stringify(args),
	};
}

/**
 * Normalize the many shapes `env.AI.run()` returns for text generation into
 * `{ text, toolCalls, usage, finishReason }`. Handles:
 *  - `{ response, usage, tool_calls }` (classic Workers AI; `response` may be an
 *    object in JSON mode)
 *  - OpenAI-style `{ choices: [{ message, finish_reason }], usage }`
 *  - Responses-style `{ output: [{ type: 'message' | 'function_call', ... }], usage }` (gpt-oss)
 *  - a bare string
 * @param {*} aiResp
 * @returns {{text: string, toolCalls: Array, usage: (Object|null), finishReason: (string|null)}}
 */
export function normalizeAIResponse(aiResp) {
	const result = { text: '', toolCalls: [], usage: null, finishReason: null };
	if (typeof aiResp === 'string') {
		result.text = aiResp;
		return result;
	}
	if (typeof aiResp !== 'object' || aiResp === null) return result;

	result.usage = normalizeUsage(aiResp.usage);

	const choice = Array.isArray(aiResp.choices) ? aiResp.choices[0] : null;
	if (choice) {
		const message = choice.message ?? {};
		result.text = contentToText(message.content ?? choice.text ?? '');
		result.toolCalls = (message.tool_calls ?? []).map(normalizeToolCall).filter(Boolean);
		result.finishReason = choice.finish_reason ?? null;
		return result;
	}

	if (Array.isArray(aiResp.output)) {
		for (const item of aiResp.output) {
			if (item?.type === 'message' && item.role === 'assistant' && Array.isArray(item.content)) {
				result.text += item.content
					.filter(part => part.type === 'output_text')
					.map(part => part.text)
					.join('');
			} else if (item?.type === 'output_text' && typeof item.text === 'string') {
				result.text += item.text;
			} else if (item?.type === 'function_call') {
				const call = normalizeToolCall(item);
				if (call) result.toolCalls.push(call);
			}
		}
		if (!result.text && typeof aiResp.text === 'string') result.text = aiResp.text;
		if (aiResp.status === 'incomplete') result.finishReason = 'length';
	} else {
		const r = aiResp.response ?? aiResp.result ?? aiResp.text;
		if (typeof r === 'string') {
			result.text = r;
		} else if (r !== undefined && r !== null) {
			result.text = typeof r === 'object' && typeof r.text === 'string' ? r.text : JSON.stringify(r);
		}
	}

	if (Array.isArray(aiResp.tool_calls)) {
		result.toolCalls.push(...aiResp.tool_calls.map(normalizeToolCall).filter(Boolean));
	}
	return result;
}
