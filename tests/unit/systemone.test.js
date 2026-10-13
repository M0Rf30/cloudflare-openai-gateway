import { describe, it, expect, vi } from 'vitest';
import { systemOneHandler } from '../../routes/systemone';
import { chatHandler } from '../../routes/chat';

const createMockRequest = body => ({
	json: () => Promise.resolve(body),
	headers: new Map([['Content-Type', 'application/json']]),
	url: 'https://example.test/v1/systemone',
	method: 'POST',
});

const questions = { urgent: { type: 'noul', instructions: 'Is this urgent?' } };

describe('System One handler', () => {
	it.each([
		['clef-flash', '@cf/cloudflare/clef-flash', 'clef-flash'],
		['@cf/cloudflare/clef-omni', '@cf/cloudflare/clef-omni', 'clef-omni'],
		[undefined, '@cf/cloudflare/clef', 'clef'],
	])('routes model %s to %s with selector %s', async (requested, path, selector) => {
		const env = { AI: { run: vi.fn().mockResolvedValue({ model: selector, answers: { urgent: { noul: 0.9 } } }) } };
		const response = await systemOneHandler(createMockRequest({ model: requested, state: 'down', questions }), env);

		expect(response.status).toBe(200);
		expect(env.AI.run).toHaveBeenCalledWith(path, { model: selector, state: 'down', questions });
		expect((await response.json()).answers.urgent.noul).toBe(0.9);
	});

	it('rejects non-decision models with 400', async () => {
		const env = { AI: { run: vi.fn() } };
		const response = await systemOneHandler(
			createMockRequest({ model: '@cf/meta/llama-3.1-8b-instruct-fp8', state: 'x', questions }),
			env,
		);

		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('rejects empty questions with 400', async () => {
		const env = { AI: { run: vi.fn() } };
		const response = await systemOneHandler(createMockRequest({ state: 'x', questions: {} }), env);

		expect(response.status).toBe(400);
		expect((await response.json()).error.param).toBe('questions');
	});
});

describe('Chat handler with decision models', () => {
	it('returns 400 pointing to /v1/systemone instead of calling Workers AI', async () => {
		const env = { AI: { run: vi.fn() } };
		const response = await chatHandler(
			createMockRequest({ model: '@cf/cloudflare/clef', messages: [{ role: 'user', content: 'hi' }] }),
			env,
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error.message).toContain('/v1/systemone');
		expect(env.AI.run).not.toHaveBeenCalled();
	});
});
