import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completionHandler } from '../../routes/completion';

const GPT_OSS = '@cf/openai/gpt-oss-120b';
const LLAMA = '@cf/meta/llama-3.1-8b-instruct-fp8';

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

describe('Completion handler', () => {
	let env;

	beforeEach(() => {
		env = createMockEnv();
	});

	const lastParams = () => env.AI.run.mock.calls.at(-1)[1];

	it('returns a text completion with a cmpl- id and real usage', async () => {
		env.AI.run.mockResolvedValue({ response: 'world', usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } });
		const response = await completionHandler(createMockRequest({ model: LLAMA, prompt: 'hello' }), env);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result.id).toMatch(/^cmpl-[0-9a-f]{32}$/);
		expect(result.object).toBe('text_completion');
		expect(result.choices[0]).toMatchObject({ text: 'world', finish_reason: 'stop', index: 0 });
		expect(result.usage).toEqual({ prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 });
		expect(lastParams().prompt).toBe('hello');
	});

	it('sends gpt-oss requests with prompt (the schema key), not input', async () => {
		env.AI.run.mockResolvedValue({ response: 'x' });
		await completionHandler(createMockRequest({ model: GPT_OSS, prompt: 'hello' }), env);
		expect(lastParams().prompt).toBe('hello');
		expect(lastParams()).not.toHaveProperty('input');
	});

	it('forwards temperature 0, top_p, seed, penalties and response_format', async () => {
		env.AI.run.mockResolvedValue({ response: 'x' });
		await completionHandler(
			createMockRequest({
				model: LLAMA,
				prompt: 'hello',
				temperature: 0,
				top_p: 0.3,
				seed: 7,
				frequency_penalty: 1,
				presence_penalty: 1,
				response_format: { type: 'json_object' },
				max_tokens: 50,
			}),
			env,
		);
		expect(lastParams()).toMatchObject({
			temperature: 0,
			top_p: 0.3,
			seed: 7,
			frequency_penalty: 1,
			presence_penalty: 1,
			response_format: { type: 'json_object' },
			max_tokens: 50,
		});
	});

	it('rejects n > 1 with a 400', async () => {
		const response = await completionHandler(createMockRequest({ model: LLAMA, prompt: 'hello', n: 3 }), env);
		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('reports finish_reason length when the token budget is exhausted', async () => {
		env.AI.run.mockResolvedValue({ response: 'cut', usage: { prompt_tokens: 2, completion_tokens: 20, total_tokens: 22 } });
		const result = await (
			await completionHandler(createMockRequest({ model: LLAMA, prompt: 'hello', max_tokens: 20 }), env)
		).json();
		expect(result.choices[0].finish_reason).toBe('length');
	});

	it('strips think blocks and enforces stop sequences', async () => {
		env.AI.run.mockResolvedValue({ response: '<think>hmm</think>one\ntwo\nthree' });
		const result = await (
			await completionHandler(createMockRequest({ model: LLAMA, prompt: 'count', stop: ['\n'] }), env)
		).json();
		expect(result.choices[0].text).toBe('one');
		expect(result.choices[0].finish_reason).toBe('stop');
	});

	it('streams text deltas, a finish chunk and [DONE]', async () => {
		env.AI.run.mockResolvedValue(sseStream([{ response: 'Hel' }, { response: 'lo' }, '[DONE]']));
		const response = await completionHandler(createMockRequest({ model: LLAMA, prompt: 'hi', stream: true }), env);
		const text = await response.text();
		const chunks = text
			.split('\n\n')
			.filter(Boolean)
			.map(b => b.replace(/^data: /, ''))
			.filter(b => b !== '[DONE]')
			.map(b => JSON.parse(b));

		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		expect(chunks.map(c => c.choices[0].text).join('')).toBe('Hello');
		expect(chunks[0].id).toMatch(/^cmpl-/);
		expect(chunks.at(-1).choices[0].finish_reason).toBe('stop');
		expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
	});

	it('streams gpt-oss OpenAI-style deltas with a usage chunk when requested', async () => {
		env.AI.run.mockResolvedValue(
			sseStream([
				{ choices: [{ delta: { content: 'Hi' } }] },
				{ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
				'[DONE]',
			]),
		);
		const response = await completionHandler(
			createMockRequest({ model: GPT_OSS, prompt: 'hi', stream: true, stream_options: { include_usage: true } }),
			env,
		);
		const text = await response.text();
		expect(text).toContain('"text":"Hi"');
		expect(text).toContain('"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}');
	});

	it('validates the prompt', async () => {
		expect((await completionHandler(createMockRequest({ model: LLAMA }), env)).status).toBe(400);
		expect((await completionHandler(createMockRequest({ model: LLAMA, prompt: 5 }), env)).status).toBe(400);
	});
});
