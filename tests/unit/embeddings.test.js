import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embeddingsHandler } from '../../routes/embeddings.js';
import * as embeddingsModule from '../../routes/embeddings.js';

const createEnv = () => ({
	AI: { run: vi.fn() },
	ACCESS_TOKEN: 'test-token',
});

const createRequest = (body, headers = { 'Content-Type': 'application/json' }) =>
	new Request('https://gateway.test/v1/embeddings', {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});

// Real output shape of the bge / qwen3 / gemma embedding models.
const embeddingOutput = (vectors, dims = vectors[0].length) => ({ shape: [vectors.length, dims], data: vectors });

describe('Embeddings Handler', () => {
	let env;

	beforeEach(() => {
		env = createEnv();
	});

	it('handles a single text embedding', async () => {
		env.AI.run.mockResolvedValue(embeddingOutput([[0.1, 0.2, 0.3, 0.4]]));

		const response = await embeddingsHandler(createRequest({ input: 'Hello, world!', model: '@cf/baai/bge-base-en-v1.5' }), env);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result.object).toBe('list');
		expect(result.data).toHaveLength(1);
		expect(result.data[0]).toMatchObject({ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3, 0.4] });
	});

	it('handles batch embeddings', async () => {
		env.AI.run.mockResolvedValue(embeddingOutput([[0.1, 0.2], [0.5, 0.6]]));

		const result = await (
			await embeddingsHandler(createRequest({ input: ['Hello, world!', 'How are you?'], model: '@cf/baai/bge-base-en-v1.5' }), env)
		).json();

		expect(result.data.map(d => d.index)).toEqual([0, 1]);
		expect(result.data[1].embedding).toEqual([0.5, 0.6]);
	});

	it('rejects missing, empty and malformed input', async () => {
		for (const body of [{}, { input: '' }, { input: [] }, { input: [''] }, { input: [1, 2] }, { input: { a: 1 } }]) {
			expect((await embeddingsHandler(createRequest(body), env)).status, JSON.stringify(body)).toBe(400);
		}
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('rejects a non-JSON content type', async () => {
		const response = await embeddingsHandler(createRequest({ input: 'x' }, { 'Content-Type': 'text/plain' }), env);

		expect(response.status).toBe(400);
	});

	it('uses the default model and wraps a string input in an array', async () => {
		env.AI.run.mockResolvedValue(embeddingOutput([[0.1, 0.2, 0.3, 0.4]]));

		const response = await embeddingsHandler(createRequest({ input: 'Hello, world!' }), env);

		expect(response.status).toBe(200);
		expect(env.AI.run).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ text: ['Hello, world!'] }));
	});

	it('maps OpenAI model names and runs other Cloudflare embedding models', async () => {
		env.AI.run.mockResolvedValue(embeddingOutput([[0.1, 0.2]]));

		await embeddingsHandler(createRequest({ input: 'x', model: 'text-embedding-3-small' }), env);
		expect(env.AI.run).toHaveBeenLastCalledWith('@cf/baai/bge-small-en-v1.5', { text: ['x'], pooling: 'mean' });

		await embeddingsHandler(createRequest({ input: 'x', model: '@cf/google/embeddinggemma-300m' }), env);
		expect(env.AI.run).toHaveBeenLastCalledWith('@cf/google/embeddinggemma-300m', { text: ['x'] });
	});

	it('passes pooling only to models that take it', async () => {
		env.AI.run.mockResolvedValue(embeddingOutput([[0.1, 0.2]]));

		await embeddingsHandler(createRequest({ input: 'x', model: '@cf/baai/bge-base-en-v1.5', pooling: 'cls' }), env);
		expect(env.AI.run).toHaveBeenLastCalledWith('@cf/baai/bge-base-en-v1.5', { text: ['x'], pooling: 'cls' });

		await embeddingsHandler(createRequest({ input: 'x', model: '@cf/qwen/qwen3-embedding-0.6b', pooling: 'cls' }), env);
		expect(env.AI.run).toHaveBeenLastCalledWith('@cf/qwen/qwen3-embedding-0.6b', { text: ['x'] });
	});

	it('enforces per-model batch limits (qwen3: 32, bge: 100)', async () => {
		const inputs = n => Array.from({ length: n }, (_, i) => `text ${i}`);
		env.AI.run.mockImplementation(async (_model, { text }) => embeddingOutput(text.map(() => [0.1, 0.2])));

		const qwen33 = await embeddingsHandler(createRequest({ model: '@cf/qwen/qwen3-embedding-0.6b', input: inputs(33) }), env);
		expect(qwen33.status).toBe(400);
		expect((await qwen33.json()).error.message).toMatch(/32/);

		const qwen32 = await embeddingsHandler(createRequest({ model: '@cf/qwen/qwen3-embedding-0.6b', input: inputs(32) }), env);
		expect(qwen32.status).toBe(200);

		const bge100 = await embeddingsHandler(createRequest({ model: '@cf/baai/bge-base-en-v1.5', input: inputs(100) }), env);
		expect(bge100.status).toBe(200);
		const bge101 = await embeddingsHandler(createRequest({ model: '@cf/baai/bge-base-en-v1.5', input: inputs(101) }), env);
		expect(bge101.status).toBe(400);
	});

	it('returns Float32 little-endian base64 for encoding_format=base64', async () => {
		const vector = [0.5, -1.25, 3];
		env.AI.run.mockResolvedValue(embeddingOutput([vector]));

		const result = await (
			await embeddingsHandler(createRequest({ input: 'x', model: '@cf/baai/bge-base-en-v1.5', encoding_format: 'base64' }), env)
		).json();

		const bytes = Uint8Array.from(atob(result.data[0].embedding), c => c.charCodeAt(0));
		expect(Array.from(new Float32Array(bytes.buffer))).toEqual(vector);
		expect(Array.from(bytes.slice(0, 4))).toEqual([0, 0, 0, 0x3f]); // 0.5f little-endian
	});

	it('rejects unknown encoding formats', async () => {
		const response = await embeddingsHandler(createRequest({ input: 'x', encoding_format: 'hex' }), env);

		expect(response.status).toBe(400);
	});

	it('accepts dimensions equal to the model size and rejects other values', async () => {
		env.AI.run.mockResolvedValue(embeddingOutput([[0.1, 0.2]]));
		const model = '@cf/baai/bge-base-en-v1.5';

		expect((await embeddingsHandler(createRequest({ input: 'x', model, dimensions: 768 }), env)).status).toBe(200);
		const rejected = await embeddingsHandler(createRequest({ input: 'x', model, dimensions: 256 }), env);
		expect(rejected.status).toBe(400);
		expect((await rejected.json()).error.param).toBe('dimensions');
	});

	it('rejects unknown models', async () => {
		const response = await embeddingsHandler(createRequest({ input: 'x', model: 'gpt-4' }), env);

		expect(response.status).toBe(400);
	});

	it('includes usage information', async () => {
		env.AI.run.mockResolvedValue(embeddingOutput([[0.1, 0.2]]));

		const result = await (await embeddingsHandler(createRequest({ input: 'Hello, world!' }), env)).json();

		expect(result.usage).toMatchObject({ prompt_tokens: expect.any(Number), total_tokens: expect.any(Number) });
	});

	it('maps Workers AI errors through the shared handler (no ad-hoc catch)', async () => {
		env.AI.run.mockRejectedValue(new Error('3036: daily free allocation used up'));
		expect((await embeddingsHandler(createRequest({ input: 'x' }), env)).status).toBe(429);

		env.AI.run.mockRejectedValue(new Error('AI service error'));
		const response = await embeddingsHandler(createRequest({ input: 'x' }), env);
		expect(response.status).toBe(500);
		expect((await response.json()).error.message).toBe('AI service error');
	});

	it('no longer exports a health handler', () => {
		expect(embeddingsModule.healthHandler).toBeUndefined();
	});
});
