import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatHandler } from '../../routes/chat';
import { MODEL_CATEGORIES, MODEL_CAPABILITIES } from '../../utils/models.js';

const FC_MODEL = MODEL_CATEGORIES.chat.find(m => MODEL_CAPABILITIES[m]?.includes('function-calling'));
const PLAIN_MODEL = MODEL_CATEGORIES.chat.find(m => !MODEL_CAPABILITIES[m]?.includes('function-calling'));
const GPT_OSS = '@cf/openai/gpt-oss-120b';

const createMockEnv = () => ({ AI: { run: vi.fn() }, ACCESS_TOKEN: 'test-token' });

const createMockRequest = body => ({
	json: () => Promise.resolve(body),
	headers: new Map([['Content-Type', 'application/json']]),
});

const sseStream = events =>
	new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			for (const e of events) {
				controller.enqueue(enc.encode(e === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(e)}\n\n`));
			}
			controller.close();
		},
	});

const weatherTool = {
	type: 'function',
	function: {
		name: 'get_weather',
		description: 'Get the weather',
		parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
	},
};

describe('Chat handler: parameters', () => {
	let env;

	beforeEach(() => {
		env = createMockEnv();
		env.AI.run.mockResolvedValue({ response: 'ok' });
	});

	const lastParams = () => env.AI.run.mock.calls.at(-1)[1];

	it('forwards temperature 0 instead of replacing it with the default', async () => {
		await chatHandler(createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }], temperature: 0 }), env);
		expect(lastParams().temperature).toBe(0);
	});

	it('forwards top_p (under the Workers AI key name) and clamps it to the valid range', async () => {
		await chatHandler(createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }], top_p: 0.2 }), env);
		expect(lastParams().top_p).toBe(0.2);
		expect(lastParams()).not.toHaveProperty('topP');

		await chatHandler(createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }], top_p: 0 }), env);
		expect(lastParams().top_p).toBe(0.001);
	});

	it('uses defaults when temperature/top_p are absent', async () => {
		await chatHandler(createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }] }), env);
		expect(lastParams().temperature).toBe(0.7);
		expect(lastParams().top_p).toBe(0.9);
	});

	it('forwards seed, penalties and response_format; maps max_completion_tokens to max_tokens', async () => {
		await chatHandler(
			createMockRequest({
				model: GPT_OSS,
				messages: [{ role: 'user', content: 'hi' }],
				seed: 42,
				frequency_penalty: 0.5,
				presence_penalty: -0.5,
				response_format: { type: 'json_object' },
				max_completion_tokens: 123,
			}),
			env,
		);
		expect(lastParams()).toMatchObject({
			seed: 42,
			frequency_penalty: 0.5,
			presence_penalty: -0.5,
			response_format: { type: 'json_object' },
			max_tokens: 123,
		});
	});

	it('rejects n > 1 with a 400 and does not call the model', async () => {
		const response = await chatHandler(
			createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }], n: 2 }),
			env,
		);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error.param).toBe('n');
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('accepts n = 1', async () => {
		const response = await chatHandler(
			createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }], n: 1 }),
			env,
		);
		expect(response.status).toBe(200);
	});

	it('rejects an invalid response_format', async () => {
		const response = await chatHandler(
			createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }], response_format: { type: 'xml' } }),
			env,
		);
		expect(response.status).toBe(400);
	});

	it('sends gpt-oss requests as messages (array content preserved), not flattened input', async () => {
		await chatHandler(
			createMockRequest({
				model: GPT_OSS,
				messages: [
					{ role: 'system', content: 'Be brief' },
					{ role: 'user', content: [{ type: 'text', text: 'hello there' }] },
				],
			}),
			env,
		);
		const params = lastParams();
		expect(params).not.toHaveProperty('input');
		expect(params.messages).toHaveLength(2);
		expect(JSON.stringify(params.messages)).toContain('hello there');
		expect(JSON.stringify(params.messages)).not.toContain('[object Object]');
	});

	it('enforces stop sequences on non-streaming output', async () => {
		env.AI.run.mockResolvedValue({ response: 'alpha beta END gamma' });
		const response = await chatHandler(
			createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }], stop: 'END' }),
			env,
		);
		const result = await response.json();
		expect(result.choices[0].message.content).toBe('alpha beta ');
		expect(result.choices[0].finish_reason).toBe('stop');
	});
});

describe('Chat handler: response shape', () => {
	let env;

	beforeEach(() => {
		env = createMockEnv();
	});

	it('uses a chatcmpl- prefixed id', async () => {
		env.AI.run.mockResolvedValue({ response: 'ok' });
		const result = await (
			await chatHandler(createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }] }), env)
		).json();
		expect(result.id).toMatch(/^chatcmpl-[0-9a-f]{32}$/);
	});

	it('reports real usage from the model response', async () => {
		env.AI.run.mockResolvedValue({
			response: 'ok',
			usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 },
		});
		const result = await (
			await chatHandler(createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }] }), env)
		).json();
		expect(result.usage).toEqual({ prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 });
		expect(result.choices[0].finish_reason).toBe('stop');
	});

	it('estimates usage (counting array content) when the model reports none', async () => {
		env.AI.run.mockResolvedValue({ response: 'abcdefgh' });
		const result = await (
			await chatHandler(
				createMockRequest({
					model: GPT_OSS,
					messages: [{ role: 'user', content: [{ type: 'text', text: 'a'.repeat(40) }] }],
				}),
				env,
			)
		).json();
		expect(result.usage.prompt_tokens).toBe(10);
		expect(result.usage.completion_tokens).toBe(2);
		expect(result.usage.total_tokens).toBe(12);
	});

	it('returns finish_reason "length" when completion tokens hit max_tokens', async () => {
		env.AI.run.mockResolvedValue({
			response: 'truncated',
			usage: { prompt_tokens: 5, completion_tokens: 64, total_tokens: 69 },
		});
		const result = await (
			await chatHandler(
				createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }], max_tokens: 64 }),
				env,
			)
		).json();
		expect(result.choices[0].finish_reason).toBe('length');
	});

	it('extracts text and usage from a Responses-style gpt-oss result', async () => {
		env.AI.run.mockResolvedValue({
			id: 'resp_1',
			object: 'response',
			status: 'completed',
			output: [
				{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'thinking' }] },
				{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The answer' }] },
			],
			usage: { input_tokens: 4, output_tokens: 6, total_tokens: 10 },
		});
		const result = await (
			await chatHandler(createMockRequest({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }] }), env)
		).json();
		expect(result.choices[0].message.content).toBe('The answer');
		expect(result.usage).toEqual({ prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 });
	});

	it('serializes object responses produced by JSON mode', async () => {
		env.AI.run.mockResolvedValue({ response: { answer: 42 } });
		const result = await (
			await chatHandler(
				createMockRequest({
					model: GPT_OSS,
					messages: [{ role: 'user', content: 'hi' }],
					response_format: { type: 'json_object' },
				}),
				env,
			)
		).json();
		expect(JSON.parse(result.choices[0].message.content)).toEqual({ answer: 42 });
	});
});

describe('Chat handler: streaming', () => {
	let env;

	beforeEach(() => {
		env = createMockEnv();
	});

	const stream = async (body, events) => {
		env.AI.run.mockResolvedValue(sseStream(events));
		const response = await chatHandler(createMockRequest({ stream: true, ...body }), env);
		const text = await response.text();
		const chunks = text
			.split('\n\n')
			.filter(Boolean)
			.map(b => b.replace(/^data: /, ''))
			.filter(b => b !== '[DONE]')
			.map(b => JSON.parse(b));
		return { response, text, chunks };
	};

	const content = chunks => chunks.flatMap(c => c.choices).map(c => c.delta?.content ?? '').join('');

	it('yields content deltas for a non-reasoning model', async () => {
		const { chunks, text } = await stream({ model: PLAIN_MODEL, messages: [{ role: 'user', content: 'hi' }] }, [
			{ response: 'Hello' },
			{ response: ' world' },
			'[DONE]',
		]);
		expect(content(chunks)).toBe('Hello world');
		expect(chunks[0].id).toMatch(/^chatcmpl-/);
		expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
	});

	it('strips a think block split across events', async () => {
		const { chunks } = await stream({ model: PLAIN_MODEL, messages: [{ role: 'user', content: 'hi' }] }, [
			{ response: '<think>plan' },
			{ response: ' it</thi' },
			{ response: 'nk>Answer' },
			'[DONE]',
		]);
		expect(content(chunks)).toBe('Answer');
	});

	it('yields content for the gpt-oss OpenAI-style stream shape', async () => {
		const { chunks } = await stream({ model: GPT_OSS, messages: [{ role: 'user', content: 'hi' }] }, [
			{ choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] },
			{ choices: [{ index: 0, delta: { content: 'Hello' } }] },
			{ choices: [{ index: 0, delta: { content: ' oss' } }] },
			{ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
			'[DONE]',
		]);
		expect(content(chunks)).toBe('Hello oss');
		expect(env.AI.run.mock.calls[0][1].messages).toBeDefined();
	});

	it('adds a usage chunk when stream_options.include_usage is set', async () => {
		const { chunks } = await stream(
			{
				model: PLAIN_MODEL,
				messages: [{ role: 'user', content: 'hi' }],
				stream_options: { include_usage: true },
			},
			[{ response: 'Hi' }, { response: '', usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } }, '[DONE]'],
		);
		const last = chunks.at(-1);
		expect(last.choices).toEqual([]);
		expect(last.usage).toEqual({ prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 });
	});

	it('streams native tool calls for a function-calling model', async () => {
		const { chunks } = await stream(
			{ model: FC_MODEL, messages: [{ role: 'user', content: 'weather in Rome?' }], tools: [weatherTool] },
			[{ response: '', tool_calls: [{ name: 'get_weather', arguments: { city: 'Rome' } }] }, '[DONE]'],
		);
		const calls = chunks.flatMap(c => c.choices).flatMap(c => c.delta?.tool_calls ?? []);
		expect(calls[0].function).toEqual({ name: 'get_weather', arguments: '{"city":"Rome"}' });
		expect(chunks.at(-1).choices[0].finish_reason).toBe('tool_calls');
		expect(env.AI.run.mock.calls[0][1].stream).toBe(true);
	});

	it('replays prompt-injected tool calls as SSE for models without native function calling', async () => {
		env.AI.run.mockResolvedValue({ response: '{"function_call":{"name":"get_weather","arguments":{"city":"Rome"}}}' });
		const response = await chatHandler(
			createMockRequest({
				stream: true,
				model: PLAIN_MODEL,
				messages: [{ role: 'user', content: 'weather?' }],
				tools: [weatherTool],
			}),
			env,
		);
		const text = await response.text();
		expect(env.AI.run.mock.calls[0][1].stream).toBe(false);
		expect(text).toContain('"name":"get_weather"');
		expect(text).toContain('"finish_reason":"tool_calls"');
		expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
	});
});

describe('Chat handler: tool calling', () => {
	let env;

	beforeEach(() => {
		env = createMockEnv();
	});

	it('has at least one function-calling and one plain chat model in the catalog', () => {
		expect(FC_MODEL).toBeDefined();
		expect(PLAIN_MODEL).toBeDefined();
	});

	it('passes native tools and maps tool_calls for a function-calling model', async () => {
		env.AI.run.mockResolvedValue({
			response: null,
			tool_calls: [{ name: 'get_weather', arguments: { city: 'Rome' } }],
			usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
		});
		const messages = [{ role: 'user', content: 'weather in Rome?' }];
		const response = await chatHandler(createMockRequest({ model: FC_MODEL, messages, tools: [weatherTool] }), env);
		const result = await response.json();

		const params = env.AI.run.mock.calls[0][1];
		expect(params.tools).toEqual([weatherTool]);
		expect(params.messages).toHaveLength(1);

		const choice = result.choices[0];
		expect(choice.finish_reason).toBe('tool_calls');
		expect(choice.message.role).toBe('assistant');
		expect(choice.message.content).toBeNull();
		expect(choice.message.tool_calls).toHaveLength(1);
		expect(choice.message.tool_calls[0]).toMatchObject({
			type: 'function',
			function: { name: 'get_weather', arguments: '{"city":"Rome"}' },
		});
		expect(choice.message.tool_calls[0].id).toMatch(/^call_/);
		expect(result.usage.total_tokens).toBe(28);
	});

	it('maps OpenAI-style tool_calls in the model response', async () => {
		env.AI.run.mockResolvedValue({
			choices: [
				{
					message: {
						role: 'assistant',
						content: null,
						tool_calls: [{ id: 'call_x', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Oslo"}' } }],
					},
					finish_reason: 'tool_calls',
				},
			],
		});
		const result = await (
			await chatHandler(
				createMockRequest({ model: FC_MODEL, messages: [{ role: 'user', content: 'w?' }], tools: [weatherTool] }),
				env,
			)
		).json();
		expect(result.choices[0].message.tool_calls[0]).toMatchObject({
			id: 'call_x',
			function: { name: 'get_weather', arguments: '{"city":"Oslo"}' },
		});
	});

	it('falls back to prompt injection for models without function calling', async () => {
		env.AI.run.mockResolvedValue({
			response: 'Sure {not json} {"function_call":{"name":"get_weather","arguments":{"city":"Rome"}}}',
		});
		const messages = [
			{ role: 'system', content: 'You are helpful' },
			{ role: 'user', content: 'weather in Rome?' },
		];
		const response = await chatHandler(createMockRequest({ model: PLAIN_MODEL, messages, tools: [weatherTool] }), env);
		const result = await response.json();

		const params = env.AI.run.mock.calls[0][1];
		expect(params).not.toHaveProperty('tools');
		expect(params.messages[0].content).toContain('get_weather');
		// caller's message objects are not mutated
		expect(messages[0].content).toBe('You are helpful');

		const choice = result.choices[0];
		expect(choice.finish_reason).toBe('tool_calls');
		expect(choice.message.tool_calls[0].function).toEqual({ name: 'get_weather', arguments: '{"city":"Rome"}' });
		expect(choice.message.content).toBe('Sure {not json}');
	});

	it('converts tool / assistant tool_calls history to text for models without function calling', async () => {
		env.AI.run.mockResolvedValue({ response: 'It is sunny.' });
		const messages = [
			{ role: 'user', content: 'weather in Rome?' },
			{
				role: 'assistant',
				content: null,
				tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Rome"}' } }],
			},
			{ role: 'tool', tool_call_id: 'call_1', content: 'sunny, 25C' },
		];
		await chatHandler(createMockRequest({ model: PLAIN_MODEL, messages }), env);

		const sent = env.AI.run.mock.calls[0][1].messages;
		expect(sent.every(m => typeof m.content === 'string')).toBe(true);
		expect(sent.some(m => m.role === 'tool')).toBe(false);
		expect(sent[1].content).toContain('get_weather');
		expect(sent[2].content).toContain('sunny, 25C');
	});

	it('normalizes tool history for native function-calling models (name resolved, null content removed)', async () => {
		env.AI.run.mockResolvedValue({ response: 'It is sunny.' });
		const messages = [
			{ role: 'user', content: 'weather in Rome?' },
			{
				role: 'assistant',
				content: null,
				tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Rome"}' } }],
			},
			{ role: 'tool', tool_call_id: 'call_1', content: [{ type: 'text', text: 'sunny, 25C' }] },
		];
		await chatHandler(createMockRequest({ model: FC_MODEL, messages, tools: [weatherTool] }), env);

		const sent = env.AI.run.mock.calls[0][1].messages;
		expect(sent[1].content).toBe('');
		expect(sent[1].tool_calls).toHaveLength(1);
		expect(sent[2]).toMatchObject({ role: 'tool', name: 'get_weather', tool_call_id: 'call_1', content: 'sunny, 25C' });
		// original untouched
		expect(messages[1].content).toBeNull();
	});

	it('does not expose tools when tool_choice is "none"', async () => {
		env.AI.run.mockResolvedValue({ response: 'hello' });
		await chatHandler(
			createMockRequest({
				model: FC_MODEL,
				messages: [{ role: 'user', content: 'hi' }],
				tools: [weatherTool],
				tool_choice: 'none',
			}),
			env,
		);
		expect(env.AI.run.mock.calls[0][1]).not.toHaveProperty('tools');
	});

	it('rejects unsupported tool types', async () => {
		const response = await chatHandler(
			createMockRequest({
				model: FC_MODEL,
				messages: [{ role: 'user', content: 'hi' }],
				tools: [{ type: 'retrieval' }],
			}),
			env,
		);
		expect(response.status).toBe(400);
	});
});

describe('Chat handler: remote images', () => {
	let env;
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		env = createMockEnv();
		env.AI.run.mockResolvedValue({ response: 'a cat' });
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	const imageRequest = (url, extra = {}) =>
		createMockRequest({
			model: PLAIN_MODEL,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'what is this?' },
						{ type: 'image_url', image_url: { url } },
					],
				},
			],
			...extra,
		});

	it('fetches a remote image exactly once, even when tools are requested', async () => {
		globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }));
		await chatHandler(imageRequest('https://example.com/cat.png', { tools: [weatherTool] }), env);

		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		const userMessage = env.AI.run.mock.calls[0][1].messages.find(m => m.role === 'user');
		const part = userMessage.content[1];
		expect(part.image_url.url).toBe('data:image/png;base64,AQID');
	});

	it('rejects non-image content types with a 400', async () => {
		globalThis.fetch = vi.fn(async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
		const response = await chatHandler(imageRequest('https://example.com/page'), env);
		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('rejects images larger than 10MB (declared and actual)', async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response('x', { headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) } }),
		);
		expect((await chatHandler(imageRequest('https://example.com/big.png'), env)).status).toBe(400);

		globalThis.fetch = vi.fn(
			async () => new Response(new Uint8Array(10 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } }),
		);
		expect((await chatHandler(imageRequest('https://example.com/big2.png'), env)).status).toBe(400);
	});
});

describe('Chat handler: cache', () => {
	it('keys the cache on temperature 0 vs default, top_p, seed and stop', async () => {
		const { generateCacheKey } = await import('../../utils/cache.js');
		const messages = [{ role: 'user', content: 'hi' }];
		const base = await generateCacheKey('m', messages, { temperature: 0.7, top_p: 0.9, max_tokens: 100 });
		expect(await generateCacheKey('m', messages, { temperature: 0, top_p: 0.9, max_tokens: 100 })).not.toBe(base);
		expect(await generateCacheKey('m', messages, { temperature: 0.7, top_p: 0.5, max_tokens: 100 })).not.toBe(base);
		expect(await generateCacheKey('m', messages, { temperature: 0.7, top_p: 0.9, max_tokens: 100, seed: 1 })).not.toBe(base);
		expect(await generateCacheKey('m', messages, { temperature: 0.7, top_p: 0.9, max_tokens: 100, stop: ['x'] })).not.toBe(base);
		expect(
			await generateCacheKey('m', messages, { temperature: 0.7, top_p: 0.9, max_tokens: 100, response_format: { type: 'json_object' } }),
		).not.toBe(base);
		expect(await generateCacheKey('m', messages, { temperature: 0.7, top_p: 0.9, max_tokens: 100, tools: [weatherTool] })).not.toBe(base);
	});
});
