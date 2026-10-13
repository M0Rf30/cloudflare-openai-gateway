import { normalizeToolCall } from './format.js';

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

/**
 * Strips `<think>…</think>` reasoning from decoded text deltas.
 * Works on tokens, so tags split across events are handled.
 *  - default: reasoning is only recognised when the output starts with `<think>`.
 *  - implicit: for models whose template opens the think block in the prompt
 *    (output contains only `…</think>answer`). Everything is held back until
 *    `</think>` shows up; if it never does, the held text is released at end().
 */
class ThinkFilter {
	constructor(implicit = false) {
		this.state = implicit ? 'implicit' : 'start';
		this.buf = '';
	}

	push(text) {
		switch (this.state) {
		case 'text':
			return text;
		case 'start': {
			this.buf += text;
			const trimmed = this.buf.trimStart();
			if (trimmed === '') return '';
			if (trimmed.startsWith(THINK_OPEN)) {
				this.state = 'think';
				this.buf = trimmed.slice(THINK_OPEN.length);
				return this.push('');
			}
			if (THINK_OPEN.startsWith(trimmed)) return '';
			this.state = 'text';
			const out = this.buf;
			this.buf = '';
			return out;
		}
		case 'think': {
			this.buf += text;
			const index = this.buf.indexOf(THINK_CLOSE);
			if (index === -1) {
				// keep only a tail long enough to detect a split closing tag
				this.buf = this.buf.slice(-(THINK_CLOSE.length - 1));
				return '';
			}
			const rest = this.buf.slice(index + THINK_CLOSE.length);
			this.buf = '';
			this.state = 'after';
			return this.push(rest);
		}
		case 'implicit': {
			this.buf += text;
			const index = this.buf.indexOf(THINK_CLOSE);
			if (index === -1) return '';
			const rest = this.buf.slice(index + THINK_CLOSE.length);
			this.buf = '';
			this.state = 'after';
			return this.push(rest);
		}
		case 'after': {
			// drop whitespace between </think> and the answer, then pass through
			const trimmed = text.trimStart();
			if (trimmed === '') return '';
			this.state = 'text';
			return trimmed;
		}
		default:
			return text;
		}
	}

	end() {
		// Unterminated explicit think block: reasoning only, nothing to release.
		// Held text in start/implicit state was never a think block: release it.
		const out = this.state === 'start' || this.state === 'implicit' ? this.buf : '';
		this.buf = '';
		return out;
	}
}

/**
 * Cuts the stream at the first stop sequence, holding back just enough
 * characters to detect sequences split across tokens.
 */
class StopFilter {
	constructor(stops) {
		this.stops = stops ?? [];
		this.hold = this.stops.reduce((max, s) => Math.max(max, s.length), 1) - 1;
		this.buf = '';
		this.stopped = false;
	}

	push(text) {
		if (this.stopped || !text) return '';
		if (this.stops.length === 0) return text;
		this.buf += text;
		let cut = -1;
		for (const stop of this.stops) {
			const index = this.buf.indexOf(stop);
			if (index !== -1 && (cut === -1 || index < cut)) cut = index;
		}
		if (cut !== -1) {
			const out = this.buf.slice(0, cut);
			this.buf = '';
			this.stopped = true;
			return out;
		}
		if (this.buf.length > this.hold) {
			const out = this.buf.slice(0, this.buf.length - this.hold);
			this.buf = this.buf.slice(this.buf.length - this.hold);
			return out;
		}
		return '';
	}

	end() {
		const out = this.stopped ? '' : this.buf;
		this.buf = '';
		return out;
	}
}

/** Pull the pieces we care about out of one decoded upstream SSE event. */
function readEvent(data) {
	const event = { text: '', toolCalls: [], usage: null, finishReason: null };
	if (!data || typeof data !== 'object') return event;

	const usage = data.usage ?? data.response?.usage;
	if (usage && typeof usage === 'object') {
		const prompt = usage.prompt_tokens ?? usage.input_tokens;
		const completion = usage.completion_tokens ?? usage.output_tokens;
		if (typeof prompt === 'number' || typeof completion === 'number') {
			event.usage = {
				prompt_tokens: prompt || 0,
				completion_tokens: completion || 0,
				total_tokens: usage.total_tokens ?? (prompt || 0) + (completion || 0),
			};
		}
	}

	if (Array.isArray(data.choices)) {
		// OpenAI-style chunk (gpt-oss, newer models)
		const choice = data.choices[0];
		const delta = choice?.delta ?? {};
		if (typeof delta.content === 'string') event.text = delta.content;
		if (Array.isArray(delta.tool_calls)) event.toolCalls = delta.tool_calls;
		event.finishReason = choice?.finish_reason ?? null;
		return event;
	}

	if (typeof data.type === 'string' && data.type.startsWith('response.')) {
		// Responses-API style events
		if (data.type === 'response.output_text.delta' && typeof data.delta === 'string') event.text = data.delta;
		if (data.type === 'response.incomplete') event.finishReason = 'length';
		return event;
	}

	const response = data.response;
	if (typeof response === 'string') {
		event.text = response;
	} else if (response && typeof response === 'object') {
		event.text = response.text || response.content || JSON.stringify(response);
	}
	if (Array.isArray(data.tool_calls)) event.toolCalls = data.tool_calls;
	return event;
}

function mapFinishReason(reason) {
	if (!reason) return null;
	if (reason === 'length' || reason === 'max_tokens') return 'length';
	if (reason === 'tool_calls' || reason === 'function_call') return 'tool_calls';
	return 'stop';
}

/**
 * Build a TransformStream converting a Workers AI SSE byte stream into
 * OpenAI-compatible SSE.
 * @param {'chat'|'completion'} kind
 * @param {string} id
 * @param {number} created
 * @param {string} model
 * @param {Object} [options]
 * @param {boolean} [options.includeUsage] - emit a final usage chunk (stream_options.include_usage)
 * @param {string[]|null} [options.stop] - stop sequences to enforce
 * @param {boolean} [options.implicitThink] - model output is `…</think>answer` without an opening tag
 * @param {number} [options.maxTokens] - used to report finish_reason 'length'
 * @param {number} [options.promptTokens] - prompt estimate used if upstream sends no usage
 */
function createSSETransformer(kind, id, created, model, options = {}) {
	const { includeUsage = false, stop = null, implicitThink = false, maxTokens = null, promptTokens = 0 } = options;
	const isChat = kind === 'chat';
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	const think = new ThinkFilter(implicitThink);
	const stopFilter = new StopFilter(stop);

	let buffer = '';
	let usage = null;
	let upstreamFinish = null;
	let emittedChars = 0;
	let toolCallCount = 0;
	const toolCallIds = new Map();
	let sawToolCalls = false;

	const send = (controller, payload) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

	const chunkBase = () => ({
		id,
		object: isChat ? 'chat.completion.chunk' : 'text_completion',
		created,
		model,
	});

	const emitText = (controller, text) => {
		if (!text) return;
		emittedChars += text.length;
		if (isChat) {
			send(controller, { ...chunkBase(), choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
		} else {
			send(controller, { ...chunkBase(), choices: [{ index: 0, text, logprobs: null, finish_reason: null }] });
		}
	};

	const emitToolCalls = (controller, calls) => {
		const deltas = [];
		for (const call of calls) {
			if (call && typeof call === 'object' && call.function && typeof call.index === 'number') {
				// OpenAI-style incremental delta: forward, making sure id/type exist on first sight
				const delta = { index: call.index, function: call.function };
				if (typeof call.function.arguments !== 'string' && call.function.arguments !== undefined) {
					delta.function = { ...call.function, arguments: JSON.stringify(call.function.arguments) };
				}
				if (call.id || !toolCallIds.has(call.index)) {
					const callId = call.id ?? `call_${crypto.randomUUID().replace(/-/g, '')}`;
					toolCallIds.set(call.index, callId);
					delta.id = callId;
					delta.type = 'function';
				}
				toolCallCount = Math.max(toolCallCount, call.index + 1);
				deltas.push(delta);
			} else {
				// Complete call (native Workers AI `{name, arguments}` or OpenAI-style without index)
				const normalized = normalizeToolCall(call);
				if (!normalized) continue;
				const index = toolCallCount++;
				const callId = normalized.id ?? `call_${crypto.randomUUID().replace(/-/g, '')}`;
				toolCallIds.set(index, callId);
				deltas.push({
					index,
					id: callId,
					type: 'function',
					function: { name: normalized.name, arguments: normalized.arguments },
				});
			}
		}
		if (deltas.length === 0) return;
		sawToolCalls = true;
		send(controller, { ...chunkBase(), choices: [{ index: 0, delta: { tool_calls: deltas }, finish_reason: null }] });
	};

	const handleEvent = (controller, data) => {
		const event = readEvent(data);
		if (event.usage) usage = event.usage;
		if (event.finishReason) upstreamFinish = mapFinishReason(event.finishReason);
		if (isChat && event.toolCalls.length > 0) emitToolCalls(controller, event.toolCalls);
		if (event.text) emitText(controller, stopFilter.push(think.push(event.text)));
	};

	const handleLine = (controller, rawLine) => {
		const line = rawLine.trim();
		if (!line.startsWith('data:')) return;
		const payload = line.slice('data:'.length).trim();
		if (payload === '' || payload === '[DONE]') return;
		let data;
		try {
			data = JSON.parse(payload);
		} catch (err) {
			console.error('Error parsing streaming event:', err.message);
			return;
		}
		handleEvent(controller, data);
	};

	const consume = (controller, text, final) => {
		buffer += text;
		const lines = buffer.split('\n');
		buffer = final ? '' : lines.pop();
		for (const line of lines) handleLine(controller, line);
	};

	return new TransformStream({
		start(controller) {
			if (isChat) {
				send(controller, {
					...chunkBase(),
					choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
				});
			}
		},

		transform(chunk, controller) {
			const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
			consume(controller, text, false);
		},

		flush(controller) {
			consume(controller, decoder.decode(), true);
			emitText(controller, stopFilter.push(think.end()));
			emitText(controller, stopFilter.end());

			let finishReason;
			if (stopFilter.stopped) {
				finishReason = 'stop';
			} else if (sawToolCalls) {
				finishReason = 'tool_calls';
			} else if (upstreamFinish) {
				finishReason = upstreamFinish;
			} else if (usage && maxTokens && usage.completion_tokens >= maxTokens) {
				finishReason = 'length';
			} else {
				finishReason = 'stop';
			}

			if (isChat) {
				send(controller, { ...chunkBase(), choices: [{ index: 0, delta: {}, finish_reason: finishReason }] });
			} else {
				send(controller, {
					...chunkBase(),
					choices: [{ index: 0, text: '', logprobs: null, finish_reason: finishReason }],
				});
			}

			if (includeUsage) {
				const completionTokens = Math.ceil(emittedChars / 4);
				send(controller, {
					...chunkBase(),
					choices: [],
					usage: usage ?? {
						prompt_tokens: promptTokens,
						completion_tokens: completionTokens,
						total_tokens: promptTokens + completionTokens,
					},
				});
			}
			controller.enqueue(encoder.encode('data: [DONE]\n\n'));
		},
	});
}

/**
 * TransformStream for chat completion SSE: line-buffered parsing of Workers AI
 * events (`{response}`, OpenAI-style `{choices:[{delta}]}`, Responses-style and
 * native tool_calls), think stripping, role only on the first delta, a final
 * finish_reason chunk, optional usage chunk, and `[DONE]` from flush().
 * @param {string} id - Response id (`chatcmpl-…`)
 * @param {number} created - Epoch seconds
 * @param {string} model - Model name to report
 * @param {Object} [options] - See createSSETransformer
 * @returns {TransformStream}
 */
export function createChatStreamTransformer(id, created, model, options = {}) {
	return createSSETransformer('chat', id, created, model, options);
}

/**
 * TransformStream for legacy text completion SSE (same parsing as chat).
 * @param {string} id - Response id (`cmpl-…`)
 * @param {number} created - Epoch seconds
 * @param {string} model - Model name to report
 * @param {Object} [options] - See createSSETransformer
 * @returns {TransformStream}
 */
export function createCompletionStreamTransformer(id, created, model, options = {}) {
	return createSSETransformer('completion', id, created, model, options);
}

/**
 * Build an SSE stream from an already computed (non-streamed) chat result.
 * Used when a streamed request must be executed non-streaming, e.g. prompt-based
 * function calling where the full text has to be parsed before deciding between
 * content and tool_calls.
 * @param {string} id
 * @param {number} created
 * @param {string} model
 * @param {{content: (string|null), tool_calls?: Array}} message
 * @param {string} finishReason
 * @param {Object} usage - Emitted only when includeUsage is true
 * @param {boolean} includeUsage
 * @returns {ReadableStream<Uint8Array>}
 */
export function chatResultToStream(id, created, model, message, finishReason, usage, includeUsage) {
	const encoder = new TextEncoder();
	const base = { id, object: 'chat.completion.chunk', created, model };
	const events = [
		{ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] },
	];
	if (message.content) {
		events.push({ ...base, choices: [{ index: 0, delta: { content: message.content }, finish_reason: null }] });
	}
	if (message.tool_calls?.length) {
		const tool_calls = message.tool_calls.map((call, index) => ({ index, ...call }));
		events.push({ ...base, choices: [{ index: 0, delta: { tool_calls }, finish_reason: null }] });
	}
	events.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] });
	if (includeUsage) {
		events.push({ ...base, choices: [], usage });
	}
	const body = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
	return new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(body));
			controller.close();
		},
	});
}
