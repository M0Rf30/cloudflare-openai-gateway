import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embeddingsHandler } from '../../routes/embeddings';

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

describe('Embeddings Handler', () => {
	let mockEnv;

	beforeEach(() => {
		mockEnv = createMockEnv();
		vi.clearAllMocks();
	});

	it('should handle single text embedding', async () => {
		const mockRequest = createMockRequest({
			input: 'Hello, world!',
			model: '@cf/baai/bge-base-en-v1.5',
		});

		mockEnv.AI.run.mockResolvedValue({
			data: [[0.1, 0.2, 0.3, 0.4]],
		});

		const response = await embeddingsHandler(mockRequest, mockEnv);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result.object).toBe('list');
		expect(result.data).toHaveLength(1);
		expect(result.data[0]).toMatchObject({
			object: 'embedding',
			index: 0,
			embedding: [0.1, 0.2, 0.3, 0.4],
		});
	});

	it('should handle batch text embeddings', async () => {
		const mockRequest = createMockRequest({
			input: ['Hello, world!', 'How are you?'],
			model: '@cf/baai/bge-base-en-v1.5',
		});

		mockEnv.AI.run.mockResolvedValue({
			data: [
				[0.1, 0.2, 0.3, 0.4],
				[0.5, 0.6, 0.7, 0.8],
			],
		});

		const response = await embeddingsHandler(mockRequest, mockEnv);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result.data).toHaveLength(2);
		expect(result.data[0].index).toBe(0);
		expect(result.data[1].index).toBe(1);
	});

	it('should handle missing input error', async () => {
		const mockRequest = createMockRequest({
			model: '@cf/baai/bge-base-en-v1.5',
		});

		const response = await embeddingsHandler(mockRequest, mockEnv);

		expect(response.status).toBe(400);
	});

	it('should handle empty input error', async () => {
		const mockRequest = createMockRequest({
			input: '',
			model: '@cf/baai/bge-base-en-v1.5',
		});

		const response = await embeddingsHandler(mockRequest, mockEnv);

		expect(response.status).toBe(400);
	});

	it('should handle empty array input error', async () => {
		const mockRequest = createMockRequest({
			input: [],
			model: '@cf/baai/bge-base-en-v1.5',
		});

		const response = await embeddingsHandler(mockRequest, mockEnv);

		expect(response.status).toBe(400);
	});

	it('should use default model when not specified', async () => {
		const mockRequest = createMockRequest({
			input: 'Hello, world!',
		});

		mockEnv.AI.run.mockResolvedValue({
			data: [[0.1, 0.2, 0.3, 0.4]],
		});

		const response = await embeddingsHandler(mockRequest, mockEnv);

		expect(response.status).toBe(200);
		expect(mockEnv.AI.run).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				text: ['Hello, world!'],
			})
		);
	});

	it('should handle different Cloudflare embedding models', async () => {
		const models = [
			'@cf/baai/bge-base-en-v1.5',
			'@cf/baai/bge-small-en-v1.5',
			'@cf/baai/bge-large-en-v1.5',
		];

		for (const model of models) {
			const mockRequest = createMockRequest({
				input: 'Hello, world!',
				model,
			});

			mockEnv.AI.run.mockResolvedValue({
				data: [[0.1, 0.2, 0.3, 0.4]],
			});

			const response = await embeddingsHandler(mockRequest, mockEnv);

			expect(response.status).toBe(200);
			expect(mockEnv.AI.run).toHaveBeenLastCalledWith(model, expect.any(Object));
		}
	});

	it('should include usage information', async () => {
		const mockRequest = createMockRequest({
			input: 'Hello, world!',
			model: '@cf/baai/bge-base-en-v1.5',
		});

		mockEnv.AI.run.mockResolvedValue({
			data: [[0.1, 0.2, 0.3, 0.4]],
		});

		const response = await embeddingsHandler(mockRequest, mockEnv);
		const result = await response.json();

		expect(result.usage).toMatchObject({
			prompt_tokens: expect.any(Number),
			total_tokens: expect.any(Number),
		});
	});

	it('should handle AI service errors', async () => {
		const mockRequest = createMockRequest({
			input: 'Hello, world!',
			model: '@cf/baai/bge-base-en-v1.5',
		});

		mockEnv.AI.run.mockRejectedValue(new Error('AI service error'));

		const response = await embeddingsHandler(mockRequest, mockEnv);
		const result = await response.json();

		expect(response.status).toBe(500);
		expect(result.error.message).toBe('AI service error');
	});
});
