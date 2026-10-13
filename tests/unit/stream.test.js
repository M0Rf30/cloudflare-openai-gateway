import { describe, it, expect } from 'vitest';
import {
	createChatStreamTransformer,
	createCompletionStreamTransformer,
	chatResultToStream,
} from '../../utils/stream.js';

const encoder = new TextEncoder();

const sse = events =>
	events.map(e => (e === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(e)}\n\n`)).join('');

/** Build a byte stream from `text`, cut into pieces of `size` bytes (to split lines/JSON). */
const byteStream = (text, size = Infinity) => {
	const bytes = encoder.encode(text);
	return new ReadableStream({
		start(controller) {
			for (let i = 0; i < bytes.length; i += Math.min(size, bytes.length)) {
				controller.enqueue(bytes.slice(i, i + size));
			}
			controller.close();
		},
	});
};

/** Run the transformer and return the parsed events plus the raw text. */
const run = async (transformer, text, size) => {
	const raw = await new Response(byteStream(text, size).pipeThrough(transformer)).text();
	const events = raw
		.split('\n\n')
		.filter(Boolean)
		.map(block => block.replace(/^data: /, ''));
	return {
		raw,
		done: events.at(-1) === '[DONE]',
		chunks: events.filter(e => e !== '[DONE]').map(e => JSON.parse(e)),
	};
};

const contentOf = chunks =>
	chunks
		.flatMap(c => c.choices)
		.map(c => c.delta?.content ?? c.text ?? '')
		.join('');

const chatRun = (events, options, size) =>
	run(createChatStreamTransformer('chatcmpl-1', 1700000000, 'test-model', options), sse(events), size);

describe('chat stream transformer', () => {
	it('emits content deltas for non-reasoning output', async () => {
		const { chunks, done } = await chatRun([{ response: 'Hello' }, { response: ' world' }, '[DONE]']);

		const deltas = chunks.flatMap(c => c.choices).map(c => c.delta?.content).filter(Boolean);
		expect(deltas).toEqual(['Hello', ' world']);
		expect(done).toBe(true);
		expect(chunks.every(c => c.id === 'chatcmpl-1' && c.model === 'test-model')).toBe(true);
		expect(chunks.every(c => c.object === 'chat.completion.chunk')).toBe(true);
	});

	it('sends the role only on the first delta and ends with a finish_reason chunk', async () => {
		const { chunks } = await chatRun([{ response: 'a' }, { response: 'b' }, '[DONE]']);

		const withRole = chunks.filter(c => c.choices[0]?.delta?.role);
		expect(withRole).toHaveLength(1);
		expect(chunks[0].choices[0].delta.role).toBe('assistant');

		const last = chunks.at(-1);
		expect(last.choices[0].delta).toEqual({});
		expect(last.choices[0].finish_reason).toBe('stop');
		expect(chunks.slice(0, -1).every(c => c.choices[0].finish_reason === null)).toBe(true);
	});

	it('parses events split across arbitrary byte boundaries', async () => {
		const { chunks, done } = await chatRun([{ response: 'Hel' }, { response: 'lo wörld' }, '[DONE]'], undefined, 3);

		expect(contentOf(chunks)).toBe('Hello wörld');
		expect(done).toBe(true);
	});

	it('processes the leftover buffer (no trailing newline) in flush', async () => {
		const text = `data: ${JSON.stringify({ response: 'first' })}\n\ndata: ${JSON.stringify({ response: ' last' })}`;
		const { chunks, done } = await run(createChatStreamTransformer('id', 1, 'm'), text);

		expect(contentOf(chunks)).toBe('first last');
		expect(done).toBe(true);
	});

	it('emits [DONE] even when upstream never sent one', async () => {
		const { done } = await chatRun([{ response: 'x' }]);
		expect(done).toBe(true);
	});

	it('strips a think block present in a single event and keeps the text after it', async () => {
		const { chunks } = await chatRun([
			{ response: '<think>reasoning here</think>Answer' },
			{ response: ' more' },
			'[DONE]',
		]);

		expect(contentOf(chunks)).toBe('Answer more');
	});

	it('strips a think block whose tags are split across events', async () => {
		const { chunks } = await chatRun([
			{ response: '<th' },
			{ response: 'ink>step one</' },
			{ response: 'think>\n\nAn' },
			{ response: 'swer' },
			'[DONE]',
		]);

		expect(contentOf(chunks)).toBe('Answer');
	});

	it('handles an opening tag split across bytes and an unterminated think block', async () => {
		const { chunks } = await chatRun([{ response: '<think>never closed' }, '[DONE]'], undefined, 5);
		expect(contentOf(chunks)).toBe('');
	});

	it('does not swallow text that merely starts with "<"', async () => {
		const { chunks } = await chatRun([{ response: '<b>' }, { response: 'bold</b>' }, '[DONE]']);
		expect(contentOf(chunks)).toBe('<b>bold</b>');
	});

	it('supports models whose think block has no opening tag (implicitThink)', async () => {
		const { chunks } = await chatRun(
			[{ response: 'reasoning ' }, { response: 'text</thi' }, { response: 'nk>\n\nFinal' }, '[DONE]'],
			{ implicitThink: true },
		);
		expect(contentOf(chunks)).toBe('Final');
	});

	it('releases held text for implicitThink models that never emit </think>', async () => {
		const { chunks } = await chatRun([{ response: 'plain ' }, { response: 'answer' }, '[DONE]'], { implicitThink: true });
		expect(contentOf(chunks)).toBe('plain answer');
	});

	it('handles OpenAI-style deltas (gpt-oss) and ignores reasoning content', async () => {
		const { chunks } = await chatRun([
			{ choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'thinking...' } }] },
			{ choices: [{ index: 0, delta: { content: 'Hi' } }] },
			{ choices: [{ index: 0, delta: { content: ' there' } }] },
			{ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
			'[DONE]',
		]);

		expect(contentOf(chunks)).toBe('Hi there');
		expect(JSON.stringify(chunks)).not.toContain('thinking...');
		expect(chunks.filter(c => c.choices[0]?.delta?.role)).toHaveLength(1);
	});

	it('handles Responses-style gpt-oss events', async () => {
		const { chunks } = await chatRun([
			{ type: 'response.reasoning_text.delta', delta: 'hmm' },
			{ type: 'response.output_text.delta', delta: 'Hel' },
			{ type: 'response.output_text.delta', delta: 'lo' },
			{ type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 2 } } },
			'[DONE]',
		], { includeUsage: true });

		expect(contentOf(chunks)).toBe('Hello');
		expect(chunks.at(-1).usage).toEqual({ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
	});

	it('maps native Workers AI tool_calls to OpenAI tool_call deltas', async () => {
		const { chunks } = await chatRun([
			{ response: '', tool_calls: [{ name: 'get_weather', arguments: { city: 'Rome' } }] },
			'[DONE]',
		]);

		const toolDelta = chunks.map(c => c.choices[0]?.delta?.tool_calls).find(Boolean);
		expect(toolDelta).toHaveLength(1);
		expect(toolDelta[0]).toMatchObject({
			index: 0,
			type: 'function',
			function: { name: 'get_weather', arguments: '{"city":"Rome"}' },
		});
		expect(toolDelta[0].id).toMatch(/^call_/);
		expect(chunks.at(-1).choices[0].finish_reason).toBe('tool_calls');
	});

	it('forwards incremental OpenAI-style tool_call deltas', async () => {
		const { chunks } = await chatRun([
			{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_abc', type: 'function', function: { name: 'f', arguments: '' } }] } }] },
			{ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }] } }] },
			{ choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
			'[DONE]',
		]);

		const deltas = chunks.flatMap(c => c.choices).flatMap(c => c.delta?.tool_calls ?? []);
		expect(deltas[0]).toMatchObject({ index: 0, id: 'call_abc', type: 'function' });
		expect(deltas.map(d => d.function.arguments).join('')).toBe('{"a":1}');
		expect(chunks.at(-1).choices[0].finish_reason).toBe('tool_calls');
	});

	it('emits a usage chunk only when includeUsage is set, preferring upstream usage', async () => {
		const events = [
			{ response: 'Hello' },
			{ response: '', usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 } },
			'[DONE]',
		];
		const without = await chatRun(events);
		expect(without.chunks.some(c => c.usage)).toBe(false);

		const withUsage = await chatRun(events, { includeUsage: true });
		const last = withUsage.chunks.at(-1);
		expect(last.choices).toEqual([]);
		expect(last.usage).toEqual({ prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 });
	});

	it('estimates usage when upstream sends none', async () => {
		const { chunks } = await chatRun([{ response: 'abcdefgh' }, '[DONE]'], { includeUsage: true, promptTokens: 5 });
		expect(chunks.at(-1).usage).toEqual({ prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 });
	});

	it('reports finish_reason length when completion tokens reach max_tokens', async () => {
		const { chunks } = await chatRun(
			[{ response: 'cut off' }, { response: '', usage: { prompt_tokens: 1, completion_tokens: 50 } }, '[DONE]'],
			{ maxTokens: 50 },
		);
		expect(chunks.at(-1).choices[0].finish_reason).toBe('length');
	});

	it('enforces stop sequences, including ones split across tokens', async () => {
		const { chunks } = await chatRun(
			[{ response: 'one two ST' }, { response: 'OP three' }, { response: ' four' }, '[DONE]'],
			{ stop: ['STOP'] },
		);
		expect(contentOf(chunks)).toBe('one two ');
		expect(chunks.at(-1).choices[0].finish_reason).toBe('stop');
	});

	it('ignores malformed events without failing the stream', async () => {
		const text = `data: {not json}\n\n${sse([{ response: 'ok' }, '[DONE]'])}`;
		const { chunks, done } = await run(createChatStreamTransformer('id', 1, 'm'), text);
		expect(contentOf(chunks)).toBe('ok');
		expect(done).toBe(true);
	});

	it('accepts string chunks as well as bytes', async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue('data: {"response":"Hello!"}\n\n');
				controller.enqueue('data: [DONE]\n\n');
				controller.close();
			},
		});
		const raw = await new Response(stream.pipeThrough(createChatStreamTransformer('id', 1, 'm'))).text();
		expect(raw).toContain('"content":"Hello!"');
	});
});

describe('completion stream transformer', () => {
	const completionRun = (events, options, size) =>
		run(createCompletionStreamTransformer('cmpl-1', 1700000000, 'test-model', options), sse(events), size);

	it('emits text chunks, a finish_reason chunk and [DONE] from flush', async () => {
		const { chunks, done } = await completionRun([{ response: 'Hello' }, { response: ' world' }, '[DONE]']);

		expect(contentOf(chunks)).toBe('Hello world');
		expect(chunks.every(c => c.object === 'text_completion' && c.id === 'cmpl-1')).toBe(true);
		expect(chunks.at(-1).choices[0]).toMatchObject({ text: '', finish_reason: 'stop' });
		expect(done).toBe(true);
	});

	it('strips think blocks split across events', async () => {
		const { chunks } = await completionRun([
			{ response: '<think>abc</' },
			{ response: 'think>Result' },
			'[DONE]',
		], undefined, 4);

		expect(contentOf(chunks)).toBe('Result');
	});

	it('handles OpenAI-style deltas and usage', async () => {
		const { chunks } = await completionRun([
			{ choices: [{ delta: { content: 'Hi' } }] },
			{ choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 2, completion_tokens: 1 } },
			'[DONE]',
		], { includeUsage: true });

		expect(contentOf(chunks)).toBe('Hi');
		expect(chunks.at(-2).choices[0].finish_reason).toBe('length');
		expect(chunks.at(-1).usage.total_tokens).toBe(3);
	});
});

describe('chatResultToStream', () => {
	it('replays a computed result as SSE with tool_calls', async () => {
		const message = {
			role: 'assistant',
			content: null,
			tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'f', arguments: '{}' } }],
		};
		const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
		const { chunks, done } = await run(
			new TransformStream(),
			await new Response(chatResultToStream('chatcmpl-9', 1, 'm', message, 'tool_calls', usage, true)).text(),
		);

		expect(done).toBe(true);
		expect(chunks[0].choices[0].delta.role).toBe('assistant');
		expect(chunks.flatMap(c => c.choices).flatMap(c => c.delta?.tool_calls ?? [])[0]).toMatchObject({
			index: 0,
			id: 'call_1',
			function: { name: 'f' },
		});
		expect(chunks.at(-2).choices[0].finish_reason).toBe('tool_calls');
		expect(chunks.at(-1).usage).toEqual(usage);
	});
});
