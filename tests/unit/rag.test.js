import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	storeDocumentHandler,
	deleteDocumentHandler,
	ragSearchHandler,
	ragChatHandler,
} from '../../routes/rag.js';
import { splitTextIntoChunks } from '../../utils/vectorize.js';

const BGE_BASE = '@cf/baai/bge-base-en-v1.5';
const CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

const vectorOfSize = size => Array.from({ length: size }, (_, i) => (i % 7) / 10);

/** In-memory Vectorize index implementing the binding methods the gateway uses. */
const createIndex = () => {
	const vectors = new Map();
	return {
		vectors,
		upsert: vi.fn(async batch => {
			for (const vector of batch) vectors.set(vector.id, vector);
			return { mutationId: 'mutation-1' };
		}),
		getByIds: vi.fn(async ids => ids.map(id => vectors.get(id)).filter(Boolean)),
		deleteByIds: vi.fn(async ids => {
			for (const id of ids) vectors.delete(id);
			return { mutationId: 'mutation-2' };
		}),
		query: vi.fn().mockResolvedValue({ matches: [], count: 0 }),
	};
};

// Embedding models return { shape, data } with one vector per input text.
const embeddingRun = (dims = 768) =>
	vi.fn(async (model, input) => {
		if (model.includes('/baai/') || model.includes('embedding')) {
			const texts = [].concat(input.text);
			return { shape: [texts.length, dims], data: texts.map(() => vectorOfSize(dims)) };
		}
		return { response: 'Mock AI response' };
	});

const createEnv = (extra = {}) => ({
	AI: { run: embeddingRun() },
	VECTOR_INDEX: createIndex(),
	ACCESS_TOKEN: 'test-token',
	...extra,
});

const post = (path, body) =>
	new Request(`https://gateway.test/v1/rag/${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
		body: JSON.stringify(body),
	});

const sentences = count => Array.from({ length: count }, (_, i) => `Sentence number ${i} about topic.`).join(' ');

describe('splitTextIntoChunks', () => {
	it('terminates and covers the whole text for pathological break points', () => {
		// A period just past the 50% mark of every window: the old algorithm stepped back by `overlap` forever.
		const text = ('a'.repeat(520) + '.').repeat(40);
		const chunks = splitTextIntoChunks(text, 1000, 499);

		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.length).toBeLessThan(200);
		expect(chunks.at(-1).endsWith('.')).toBe(true);
	});

	it('produces overlapping, non-empty chunks no larger than chunkSize', () => {
		const text = sentences(200);
		const chunks = splitTextIntoChunks(text, 300, 50);

		expect(chunks.length).toBeGreaterThan(5);
		for (const chunk of chunks) {
			expect(chunk.length).toBeGreaterThan(0);
			expect(chunk.length).toBeLessThanOrEqual(300);
		}
		expect(chunks.at(-1)).toBe(text.slice(-chunks.at(-1).length));
	});

	it('rejects overlap >= chunkSize/2, bad sizes and non-integers', () => {
		expect(() => splitTextIntoChunks('x'.repeat(5000), 1000, 500)).toThrow(/chunkOverlap/);
		expect(() => splitTextIntoChunks('x'.repeat(5000), 1000, 900)).toThrow(/chunkOverlap/);
		expect(() => splitTextIntoChunks('x', 1000, -1)).toThrow(/chunkOverlap/);
		expect(() => splitTextIntoChunks('x', 10, 0)).toThrow(/chunkSize/);
		expect(() => splitTextIntoChunks('x', 5000, 0)).toThrow(/chunkSize/);
		expect(() => splitTextIntoChunks('x', '1000', 0)).toThrow(/chunkSize/);
	});
});

describe('storeDocumentHandler', () => {
	let env;

	beforeEach(() => {
		env = createEnv();
	});

	it('stores chunks with native namespaces and deterministic ids', async () => {
		const response = await storeDocumentHandler(
			post('documents', { text: 'Test document content', metadata: { docId: 'test-1', title: 'Test Document' } }),
			env,
		);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result).toEqual({ success: true, document_id: 'test-1', chunks_processed: 1, vectors_stored: 1 });
		const [vector] = env.VECTOR_INDEX.upsert.mock.calls[0][0];
		expect(vector.id).toMatch(/^[0-9a-f]{32}:0$/);
		expect(vector.namespace).toBe('documents');
		expect(vector.values).toHaveLength(768);
		expect(vector.metadata).toMatchObject({
			docId: 'test-1',
			title: 'Test Document',
			text: 'Test document content',
			chunkIndex: 0,
			chunkCount: 1,
		});
		expect(vector.metadata.namespace).toBeUndefined();
	});

	it('embeds chunks in batches of at most 100 instead of one call per chunk', async () => {
		const response = await storeDocumentHandler(
			post('documents', { text: sentences(900), chunkSize: 100, chunkOverlap: 0, metadata: { docId: 'big' } }),
			env,
		);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result.chunks_processed).toBeGreaterThan(200);
		const batchSizes = env.AI.run.mock.calls.map(([, input]) => input.text.length);
		expect(batchSizes.every(size => size <= 100)).toBe(true);
		expect(batchSizes.length).toBe(Math.ceil(result.chunks_processed / 100));
		expect(batchSizes.reduce((a, b) => a + b, 0)).toBe(result.chunks_processed);
	});

	it('re-ingesting replaces vectors (same ids) and removes stale trailing chunks', async () => {
		const metadata = { docId: 'doc' };
		await storeDocumentHandler(post('documents', { text: sentences(200), chunkSize: 300, chunkOverlap: 0, metadata }), env);
		const firstIds = [...env.VECTOR_INDEX.vectors.keys()];
		expect(firstIds.length).toBeGreaterThan(3);

		const result = await (await storeDocumentHandler(post('documents', { text: 'Short now.', metadata }), env)).json();

		expect(result.chunks_processed).toBe(1);
		expect([...env.VECTOR_INDEX.vectors.keys()]).toEqual([firstIds[0]]);
		expect(env.VECTOR_INDEX.deleteByIds).toHaveBeenCalled();
	});

	it('keeps vector ids within 64 bytes for very long docIds and separates namespaces', async () => {
		const docId = 'd'.repeat(256);
		await storeDocumentHandler(post('documents', { text: 'hello world', metadata: { docId } }), env);
		await storeDocumentHandler(post('documents', { text: 'hello world', namespace: 'other', metadata: { docId } }), env);

		const ids = [...env.VECTOR_INDEX.vectors.keys()];
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);
		for (const id of ids) expect(new TextEncoder().encode(id).length).toBeLessThanOrEqual(64);
		expect(new Set([...env.VECTOR_INDEX.vectors.values()].map(v => v.namespace))).toEqual(new Set(['documents', 'other']));
	});

	it('validates chunk options at the API boundary', async () => {
		const base = { text: sentences(50), metadata: { docId: 'x' } };
		for (const extra of [
			{ chunkSize: 1000, chunkOverlap: 500 },
			{ chunkSize: 1000, chunkOverlap: 990 },
			{ chunkSize: 50 },
			{ chunkSize: 100000 },
			{ chunkSize: 'big' },
			{ chunkOverlap: -5 },
		]) {
			expect((await storeDocumentHandler(post('documents', { ...base, ...extra }), env)).status, JSON.stringify(extra)).toBe(400);
		}
		expect(env.AI.run).not.toHaveBeenCalled();
		expect(env.VECTOR_INDEX.upsert).not.toHaveBeenCalled();
	});

	it('rejects missing docId, empty text and invalid metadata values', async () => {
		expect((await storeDocumentHandler(post('documents', { text: 'x', metadata: { title: 'T' } }), env)).status).toBe(400);
		expect((await storeDocumentHandler(post('documents', { metadata: { docId: 'a' } }), env)).status).toBe(400);
		expect((await storeDocumentHandler(post('documents', { text: '   ', metadata: { docId: 'a' } }), env)).status).toBe(400);
		expect((await storeDocumentHandler(post('documents', { text: 'x', metadata: { docId: 'a', nested: { a: 1 } } }), env)).status).toBe(400);
	});

	it('rejects embedding models whose dimensions differ from the index', async () => {
		const mismatch = await storeDocumentHandler(
			post('documents', { text: 'x', model: '@cf/baai/bge-m3', metadata: { docId: 'a' } }),
			env,
		);
		expect(mismatch.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();

		const wide = createEnv({ VECTOR_INDEX_DIMENSIONS: '1024', AI: { run: embeddingRun(1024) } });
		const ok = await storeDocumentHandler(post('documents', { text: 'x', model: '@cf/baai/bge-m3', metadata: { docId: 'a' } }), wide);
		expect(ok.status).toBe(200);
	});

	it('rejects non-embedding models via the rag category', async () => {
		const response = await storeDocumentHandler(
			post('documents', { text: 'x', model: CHAT_MODEL, metadata: { docId: 'a' } }),
			env,
		);

		expect(response.status).toBe(400);
	});

	it('returns 503 when the Vectorize binding is missing', async () => {
		delete env.VECTOR_INDEX;

		const response = await storeDocumentHandler(post('documents', { text: 'x', metadata: { docId: 'a' } }), env);

		expect(response.status).toBe(503);
		expect(env.AI.run).not.toHaveBeenCalled();
	});
});

describe('deleteDocumentHandler', () => {
	it('deletes every chunk of a stored document', async () => {
		const env = createEnv();
		await storeDocumentHandler(
			post('documents', { text: sentences(100), chunkSize: 300, chunkOverlap: 0, metadata: { docId: 'my doc' } }),
			env,
		);
		const stored = env.VECTOR_INDEX.vectors.size;
		expect(stored).toBeGreaterThan(2);

		const request = new Request('https://gateway.test/v1/rag/documents/my%20doc', { method: 'DELETE' });
		request.params = { docId: 'my%20doc' };
		const response = await deleteDocumentHandler(request, env);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ id: 'my doc', deleted: true, vectors_deleted: stored });
		expect(env.VECTOR_INDEX.vectors.size).toBe(0);
	});

	it('returns 404 for an unknown document and honours the namespace query parameter', async () => {
		const env = createEnv();
		await storeDocumentHandler(post('documents', { text: 'hello', namespace: 'ns1', metadata: { docId: 'a' } }), env);

		const wrongNamespace = new Request('https://gateway.test/v1/rag/documents/a', { method: 'DELETE' });
		wrongNamespace.params = { docId: 'a' };
		expect((await deleteDocumentHandler(wrongNamespace, env)).status).toBe(404);

		const right = new Request('https://gateway.test/v1/rag/documents/a?namespace=ns1', { method: 'DELETE' });
		right.params = { docId: 'a' };
		expect((await deleteDocumentHandler(right, env)).status).toBe(200);
	});
});

describe('ragSearchHandler', () => {
	let env;

	beforeEach(() => {
		env = createEnv();
	});

	it('queries the native namespace with all metadata and no metadata filter', async () => {
		env.VECTOR_INDEX.query.mockResolvedValue({
			matches: [{ id: 'doc-1', score: 0.95, metadata: { title: 'Test Document', text: 'Mock document content' } }],
		});

		const response = await ragSearchHandler(post('search', { query: 'Test query', top_k: 3 }), env);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(env.VECTOR_INDEX.query).toHaveBeenCalledWith(expect.any(Array), {
			topK: 3,
			namespace: 'documents',
			returnMetadata: 'all',
		});
		expect(result.query).toBe('Test query');
		expect(result.context).toBe('Mock document content');
		expect(result.sources).toEqual([{ score: 0.95, metadata: { title: 'Test Document' }, text: 'Mock document content' }]);
	});

	it('honours an explicit score_threshold of 0 and defaults to 0.7 otherwise', async () => {
		env.VECTOR_INDEX.query.mockResolvedValue({
			matches: [
				{ id: 'a', score: 0.9, metadata: { text: 'high' } },
				{ id: 'b', score: 0.1, metadata: { text: 'low' } },
			],
		});

		const zero = await (await ragSearchHandler(post('search', { query: 'q', score_threshold: 0 }), env)).json();
		expect(zero.sources).toHaveLength(2);

		const dflt = await (await ragSearchHandler(post('search', { query: 'q' }), env)).json();
		expect(dflt.sources).toHaveLength(1);
		expect(env.VECTOR_INDEX.query).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ topK: 5 }));
	});

	it('clamps top_k to Vectorize limits and rejects non-numbers', async () => {
		await ragSearchHandler(post('search', { query: 'q', top_k: 500 }), env);
		expect(env.VECTOR_INDEX.query).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ topK: 20 }));

		await ragSearchHandler(post('search', { query: 'q', top_k: 0 }), env);
		expect(env.VECTOR_INDEX.query).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ topK: 1 }));

		expect((await ragSearchHandler(post('search', { query: 'q', top_k: 'many' }), env)).status).toBe(400);
	});

	it('uses a custom namespace', async () => {
		await ragSearchHandler(post('search', { query: 'q', namespace: 'team-a' }), env);

		expect(env.VECTOR_INDEX.query).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ namespace: 'team-a' }));
	});

	it('rejects a missing query', async () => {
		expect((await ragSearchHandler(post('search', { top_k: 3 }), env)).status).toBe(400);
	});
});

describe('ragChatHandler', () => {
	let env;

	beforeEach(() => {
		env = createEnv();
		env.VECTOR_INDEX.query.mockResolvedValue({
			matches: [{ id: 'doc-1', score: 0.95, metadata: { text: 'RAG is Retrieval-Augmented Generation' } }],
		});
	});

	const chatRun = (chatOutput) => {
		const embed = embeddingRun();
		return vi.fn(async (model, input) => (model === BGE_BASE ? embed(model, input) : chatOutput(model, input)));
	};

	it('injects retrieved context and returns the completion with rag_sources', async () => {
		env.AI.run = chatRun(async () => ({ response: 'RAG stands for Retrieval-Augmented Generation.' }));

		const response = await ragChatHandler(
			post('chat', { model: CHAT_MODEL, messages: [{ role: 'user', content: 'What is RAG?' }], rag_top_k: 2 }),
			env,
		);
		const result = await response.json();

		expect(response.status).toBe(200);
		expect(result.choices[0].message.content).toContain('Retrieval-Augmented Generation');
		expect(result.rag_sources).toEqual([
			{ score: 0.95, metadata: {}, text: 'RAG is Retrieval-Augmented Generation' },
		]);
		const chatCall = env.AI.run.mock.calls.find(([model]) => model === CHAT_MODEL);
		expect(JSON.stringify(chatCall[1])).toContain('RAG is Retrieval-Augmented Generation');
		expect(env.VECTOR_INDEX.query).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ topK: 2 }));
	});

	it('flattens content-part arrays into the search query', async () => {
		env.AI.run = chatRun(async () => ({ response: 'ok' }));

		await ragChatHandler(
			post('chat', {
				model: CHAT_MODEL,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: 'What is' },
							{ type: 'image_url', image_url: { url: 'https://example.com/x.png' } },
							{ type: 'text', text: 'RAG?' },
						],
					},
				],
			}),
			env,
		);

		const embedCall = env.AI.run.mock.calls.find(([model]) => model === BGE_BASE);
		expect(embedCall[1].text).toEqual(['What is\nRAG?']);
	});

	it('returns the SSE stream untouched when stream:true', async () => {
		const encoder = new TextEncoder();
		env.AI.run = chatRun(async () => new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"response":"Retrieval"}\n\n'));
				controller.enqueue(encoder.encode('data: {"response":" augmented"}\n\n'));
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			},
		}));

		const response = await ragChatHandler(
			post('chat', { model: CHAT_MODEL, stream: true, messages: [{ role: 'user', content: 'What is RAG?' }] }),
			env,
		);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toMatch(/text\/event-stream/);
		expect(body).toContain('Retrieval');
		expect(body).toContain('augmented');
		expect(body).toContain('[DONE]');
	});

	it('does not forward RAG-only fields to the chat model', async () => {
		env.AI.run = chatRun(async () => ({ response: 'ok' }));

		await ragChatHandler(
			post('chat', {
				model: CHAT_MODEL,
				messages: [{ role: 'user', content: 'Q' }],
				namespace: 'team-a',
				embedding_model: BGE_BASE,
				rag_top_k: 1,
				rag_score_threshold: 0.1,
			}),
			env,
		);

		const chatCall = env.AI.run.mock.calls.find(([model]) => model === CHAT_MODEL);
		for (const field of ['namespace', 'embedding_model', 'rag_top_k', 'rag_score_threshold']) {
			expect(chatCall[1][field]).toBeUndefined();
		}
		expect(env.VECTOR_INDEX.query).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ namespace: 'team-a', topK: 1 }));
	});

	it('rejects missing messages, non-user last message and empty text', async () => {
		expect((await ragChatHandler(post('chat', { rag_top_k: 2 }), env)).status).toBe(400);
		expect((await ragChatHandler(post('chat', { messages: [{ role: 'assistant', content: 'hi' }] }), env)).status).toBe(400);
		expect((await ragChatHandler(post('chat', { messages: [{ role: 'user', content: [] }] }), env)).status).toBe(400);
	});
});
