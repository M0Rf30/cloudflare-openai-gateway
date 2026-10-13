import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatHandler } from '../../routes/chat';

const createMockEnv = () => ({
	AI: {
		run: vi.fn(),
	},
	ACCESS_TOKEN: 'test-token',
});

const createMockRequest = body => ({
	json: () => Promise.resolve(body),
	headers: new Map([['Content-Type', 'application/json']]),
});

describe('Chat Handler', () => {
	let mockEnv;

	beforeEach(() => {
		mockEnv = createMockEnv();
		vi.clearAllMocks();
	});

	it('should handle basic chat completion', async () => {
		const mockRequest = createMockRequest({
			model: '@cf/meta/llama-3.1-8b-instruct-fp8',
			messages: [{ role: 'user', content: 'Hello!' }],
		});

		mockEnv.AI.run.mockResolvedValue({
			response: 'Hello! How can I help you today?',
		});

		const response = await chatHandler(mockRequest, mockEnv);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result.choices).toHaveLength(1);
		expect(result.choices[0].message.content).toBe('Hello! How can I help you today?');
		expect(result.choices[0].message.role).toBe('assistant');
	});

	it('should handle streaming responses', async () => {
		const mockRequest = createMockRequest({
			model: '@cf/meta/llama-3.1-8b-instruct-fp8',
			messages: [{ role: 'user', content: 'Hello!' }],
			stream: true,
		});

		mockEnv.AI.run.mockResolvedValue(
			new ReadableStream({
				start(controller) {
					controller.enqueue('data: {"response":"Hello!"}\n\n');
					controller.enqueue('data: [DONE]\n\n');
					controller.close();
				},
			}),
		);

		const response = await chatHandler(mockRequest, mockEnv);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		const body = await response.text();
		expect(body).toContain('"content":"Hello!"');
		expect(body.trimEnd().endsWith('data: [DONE]')).toBe(true);
	});

	it('should handle system messages', async () => {
		const mockRequest = createMockRequest({
			model: '@cf/meta/llama-3.1-8b-instruct-fp8',
			messages: [
				{ role: 'system', content: 'You are a helpful assistant.' },
				{ role: 'user', content: 'Hello!' },
			],
		});

		mockEnv.AI.run.mockResolvedValue({
			response: 'Hello! How can I help you today?',
		});

		const response = await chatHandler(mockRequest, mockEnv);

		expect(response.status).toBe(200);
		expect(mockEnv.AI.run).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'system' }),
					expect.objectContaining({ role: 'user' }),
				]),
			}),
		);
	});

	it('should handle max_tokens parameter', async () => {
		const mockRequest = createMockRequest({
			model: '@cf/meta/llama-3.1-8b-instruct-fp8',
			messages: [{ role: 'user', content: 'Hello!' }],
			max_tokens: 100,
		});

		mockEnv.AI.run.mockResolvedValue({
			response: 'Hello!',
		});

		await chatHandler(mockRequest, mockEnv);

		expect(mockEnv.AI.run).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				max_tokens: 100,
			}),
		);
	});

	it('should handle missing messages error', async () => {
		const mockRequest = createMockRequest({
			model: '@cf/meta/llama-3.1-8b-instruct-fp8',
		});

		const response = await chatHandler(mockRequest, mockEnv);

		expect(response.status).toBe(400);
	});

	it('should handle empty messages error', async () => {
		const mockRequest = createMockRequest({
			model: '@cf/meta/llama-3.1-8b-instruct-fp8',
			messages: [],
		});

		const response = await chatHandler(mockRequest, mockEnv);

		expect(response.status).toBe(400);
	});

	it('should handle temperature parameter', async () => {
		const mockRequest = createMockRequest({
			model: '@cf/meta/llama-3.1-8b-instruct-fp8',
			messages: [{ role: 'user', content: 'Hello!' }],
			temperature: 0.7,
		});

		mockEnv.AI.run.mockResolvedValue({
			response: 'Hello!',
		});

		await chatHandler(mockRequest, mockEnv);

		expect(mockEnv.AI.run).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				temperature: 0.7,
			}),
		);
	});
});
