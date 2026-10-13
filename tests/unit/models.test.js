import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { modelsHandler } from '../../routes/models';

const createMockEnv = () => ({
	CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
	CLOUDFLARE_API_TOKEN: 'test-api-token',
});

describe('Models Handler', () => {
	let mockEnv;

	beforeEach(() => {
		mockEnv = createMockEnv();
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const mockApiResponse = {
		result: [
			{
				name: '@cf/meta/llama-2-7b-chat-fp16',
				source: 1,
			},
			{
				name: '@cf/openai/whisper',
				source: 1,
			},
			{
				name: '@cf/myshell-ai/melotts',
				source: 1,
			},
			{
				name: '@cf/baai/bge-base-en-v1.5',
				source: 1,
			},
		],
	};

	it('should return list of available models', async () => {
		fetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		});

		const response = await modelsHandler({}, mockEnv);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result.object).toBe('list');
		// Should include both OpenAI aliases (13) and Cloudflare models (4)
		expect(result.data.length).toBeGreaterThanOrEqual(mockApiResponse.result.length);
		// Verify OpenAI aliases are present
		const modelIds = result.data.map(m => m.id);
		expect(modelIds).toContain('gpt-3.5-turbo');
		expect(modelIds).toContain('tts-1');
		expect(modelIds).toContain('whisper-1');
		// Verify Cloudflare models are present
		expect(modelIds).toContain('@cf/meta/llama-2-7b-chat-fp16');
	});

	it('should include STT models', async () => {
		fetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		});

		const response = await modelsHandler({}, mockEnv);
		const result = await response.json();

		const sttModel = result.data.find(model => model.id === '@cf/openai/whisper');
		expect(sttModel).toBeDefined();
	});

	it('should include TTS models', async () => {
		fetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		});

		const response = await modelsHandler({}, mockEnv);
		const result = await response.json();

		const ttsModel = result.data.find(model => model.id === '@cf/myshell-ai/melotts');
		expect(ttsModel).toBeDefined();
	});

	it('should include chat models', async () => {
		fetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		});

		const response = await modelsHandler({}, mockEnv);
		const result = await response.json();

		const chatModel = result.data.find(model => model.id === '@cf/meta/llama-2-7b-chat-fp16');
		expect(chatModel).toBeDefined();
	});

	it('should include embedding models', async () => {
		fetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		});

		const response = await modelsHandler({}, mockEnv);
		const result = await response.json();

		const embeddingModel = result.data.find(model => model.id === '@cf/baai/bge-base-en-v1.5');
		expect(embeddingModel).toBeDefined();
	});

	it('should have proper model structure', async () => {
		fetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		});

		const response = await modelsHandler({}, mockEnv);
		const result = await response.json();

		const model = result.data[0];
		expect(model).toHaveProperty('id');
		expect(model).toHaveProperty('object', 'model');
		expect(model).toHaveProperty('created');
		expect(model).toHaveProperty('owned_by');
	});

	it('should not require authentication for models endpoint', async () => {
		fetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockApiResponse),
		});

		const response = await modelsHandler({}, mockEnv);

		expect(response.status).toBe(200);
	});

	it('should report created in seconds', async () => {
		fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockApiResponse) });

		const response = await modelsHandler({}, mockEnv);
		const result = await response.json();

		const nowSeconds = Math.floor(Date.now() / 1000);
		expect(Math.abs(result.data[0].created - nowSeconds)).toBeLessThan(5);
	});

	it('should return a clear error instead of fake models when secrets are missing', async () => {
		const response = await modelsHandler({}, {});
		const result = await response.json();

		expect(response.status).toBe(500);
		expect(result.error.message).toMatch(/CLOUDFLARE_API_TOKEN/);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('should only serve the test model in an explicit test environment', async () => {
		const response = await modelsHandler({}, { ENVIRONMENT: 'test' });
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result.data.map(m => m.id)).toContain('test-model');
	});

	it('should map upstream failures to an OpenAI-style error', async () => {
		fetch.mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway' });

		const response = await modelsHandler({}, mockEnv);
		const result = await response.json();

		expect(response.status).toBe(500);
		expect(result.error.type).toBe('server_error');
	});
});
