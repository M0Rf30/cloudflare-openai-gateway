import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transcriptionHandler, translationHandler, speechHandler } from '../../routes/audio.js';

const createEnv = (extra = {}) => ({
	AI: { run: vi.fn() },
	ACCESS_TOKEN: 'test-token',
	...extra,
});

const AUDIO_BYTES = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
const AUDIO_BASE64 = btoa(String.fromCharCode(...AUDIO_BYTES));

const audioFile = (bytes = AUDIO_BYTES) => new File([bytes], 'speech.wav', { type: 'audio/wav' });

const multipart = (fields = {}, { file = audioFile() } = {}) => {
	const form = new FormData();
	if (file) form.append('file', file);
	for (const [key, value] of Object.entries(fields)) {
		for (const item of [].concat(value)) form.append(key, item);
	}
	return new Request('https://gateway.test/v1/audio/transcriptions', { method: 'POST', body: form });
};

const jsonRequest = body =>
	new Request('https://gateway.test/v1/audio/speech', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

// Real output shape of @cf/openai/whisper-large-v3-turbo.
const TURBO_RESPONSE = {
	transcription_info: { language: 'en', language_probability: 0.99, duration: 2.5, duration_after_vad: 2.3 },
	text: ' Hello, world!',
	word_count: 2,
	segments: [
		{
			start: 0,
			end: 2.5,
			text: ' Hello, world!',
			temperature: 0,
			avg_logprob: -0.2,
			compression_ratio: 0.8,
			no_speech_prob: 0.01,
			words: [
				{ word: ' Hello,', start: 0, end: 0.5 },
				{ word: ' world!', start: 0.6, end: 2.5 },
			],
		},
	],
	vtt: 'WEBVTT\n\n00:00.000 --> 00:02.500\nHello, world!\n',
};

describe('transcriptionHandler', () => {
	let env;

	beforeEach(() => {
		env = createEnv();
	});

	it('transcribes with whisper-large-v3-turbo using a base64 audio string', async () => {
		env.AI.run.mockResolvedValue(TURBO_RESPONSE);

		const response = await transcriptionHandler(multipart({ model: 'whisper-1' }), env);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ text: ' Hello, world!' });
		expect(env.AI.run).toHaveBeenCalledWith('@cf/openai/whisper-large-v3-turbo', { audio: AUDIO_BASE64 });
	});

	it('uses the default STT model when none is given', async () => {
		env.AI.run.mockResolvedValue(TURBO_RESPONSE);

		await transcriptionHandler(multipart(), env);

		expect(env.AI.run).toHaveBeenCalledWith('@cf/openai/whisper-large-v3-turbo', { audio: AUDIO_BASE64 });
	});

	it('maps prompt to initial_prompt and passes language', async () => {
		env.AI.run.mockResolvedValue(TURBO_RESPONSE);

		await transcriptionHandler(multipart({ prompt: 'Technical talk', language: 'en', temperature: '0.2' }), env);

		expect(env.AI.run).toHaveBeenCalledWith('@cf/openai/whisper-large-v3-turbo', {
			audio: AUDIO_BASE64,
			language: 'en',
			initial_prompt: 'Technical talk',
		});
	});

	it('returns verbose_json with language, duration and segments from transcription_info/segments', async () => {
		env.AI.run.mockResolvedValue(TURBO_RESPONSE);

		const result = await (await transcriptionHandler(multipart({ response_format: 'verbose_json' }), env)).json();

		expect(result).toMatchObject({ task: 'transcribe', language: 'en', duration: 2.5, text: ' Hello, world!' });
		expect(result.segments).toEqual([
			{
				id: 0,
				start: 0,
				end: 2.5,
				text: ' Hello, world!',
				temperature: 0,
				avg_logprob: -0.2,
				compression_ratio: 0.8,
				no_speech_prob: 0.01,
			},
		]);
		expect(result.words).toBeUndefined();
	});

	it('returns word timestamps taken from segments[].words for timestamp_granularities[]=word', async () => {
		env.AI.run.mockResolvedValue(TURBO_RESPONSE);

		const result = await (
			await transcriptionHandler(
				multipart({ response_format: 'verbose_json', 'timestamp_granularities[]': ['word'] }),
				env,
			)
		).json();

		expect(result.words).toEqual([
			{ word: 'Hello,', start: 0, end: 0.5 },
			{ word: 'world!', start: 0.6, end: 2.5 },
		]);
		expect(result.segments).toBeUndefined();
	});

	it('returns both words and segments when both granularities are requested (bare field name too)', async () => {
		env.AI.run.mockResolvedValue(TURBO_RESPONSE);

		const result = await (
			await transcriptionHandler(
				multipart({ response_format: 'verbose_json', 'timestamp_granularities[]': 'word', timestamp_granularities: 'segment' }),
				env,
			)
		).json();

		expect(result.words).toHaveLength(2);
		expect(result.segments).toHaveLength(1);
	});

	it('rejects unknown timestamp granularities', async () => {
		const response = await transcriptionHandler(multipart({ 'timestamp_granularities[]': 'phoneme' }), env);

		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('returns text/plain for response_format=text', async () => {
		env.AI.run.mockResolvedValue(TURBO_RESPONSE);

		const response = await transcriptionHandler(multipart({ response_format: 'text' }), env);

		expect(response.headers.get('Content-Type')).toMatch(/^text\/plain/);
		expect(await response.text()).toBe(' Hello, world!');
	});

	it('builds real SRT output with comma millisecond separators', async () => {
		env.AI.run.mockResolvedValue({
			...TURBO_RESPONSE,
			segments: [
				{ start: 0, end: 1.6, text: ' First line.', words: [] },
				{ start: 3661.005, end: 3662.5, text: ' Second line.', words: [] },
			],
		});

		const response = await transcriptionHandler(multipart({ response_format: 'srt' }), env);

		expect(await response.text()).toBe(
			'1\n00:00:00,000 --> 00:00:01,600\nFirst line.\n\n2\n01:01:01,005 --> 01:01:02,500\nSecond line.\n',
		);
	});

	it('serves the model VTT when present and builds one otherwise', async () => {
		env.AI.run.mockResolvedValueOnce(TURBO_RESPONSE);
		const modelVtt = await transcriptionHandler(multipart({ response_format: 'vtt' }), env);
		expect(modelVtt.headers.get('Content-Type')).toMatch(/^text\/vtt/);
		expect(await modelVtt.text()).toBe(TURBO_RESPONSE.vtt);

		env.AI.run.mockResolvedValueOnce({ ...TURBO_RESPONSE, vtt: undefined });
		const built = await (await transcriptionHandler(multipart({ response_format: 'vtt' }), env)).text();
		expect(built).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nHello, world!\n');
	});

	it('sends legacy whisper models the audio as a byte array and parses words/vtt', async () => {
		env.AI.run.mockResolvedValue({
			text: 'Hello world.',
			word_count: 2,
			words: [
				{ word: 'Hello', start: 0, end: 0.4 },
				{ word: 'world.', start: 0.5, end: 1 },
			],
			vtt: 'WEBVTT\n',
		});

		const result = await (
			await transcriptionHandler(multipart({ model: 'whisper-tiny-en', response_format: 'verbose_json' }), env)
		).json();

		expect(env.AI.run).toHaveBeenCalledWith('@cf/openai/whisper-tiny-en', { audio: Array.from(AUDIO_BYTES) });
		expect(result).toMatchObject({ language: 'en', duration: 1, text: 'Hello world.' });
		expect(result.segments).toEqual([{ id: 0, start: 0, end: 1, text: 'Hello world.' }]);
	});

	it('rejects oversized audio for legacy whisper models without calling the model', async () => {
		const response = await transcriptionHandler(
			multipart({ model: 'whisper-tiny-en' }, { file: audioFile(new Uint8Array(2 * 1024 * 1024 + 1)) }),
			env,
		);

		expect(response.status).toBe(413);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('rejects files above the 25 MB limit', async () => {
		const response = await transcriptionHandler(
			multipart({}, { file: audioFile(new Uint8Array(25 * 1024 * 1024 + 1)) }),
			env,
		);

		expect(response.status).toBe(413);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('transcribes with nova-3 using a streamed audio body and parses the Deepgram result', async () => {
		env.AI.run.mockResolvedValue({
			results: {
				channels: [
					{
						alternatives: [
							{
								confidence: 0.99,
								transcript: 'hello there',
								words: [
									{ word: 'hello', start: 0, end: 0.4, confidence: 0.99 },
									{ word: 'there', start: 0.5, end: 0.9, confidence: 0.98 },
								],
							},
						],
					},
				],
			},
		});

		const result = await (
			await transcriptionHandler(
				multipart({ model: '@cf/deepgram/nova-3', language: 'en', response_format: 'verbose_json', 'timestamp_granularities[]': 'word' }),
				env,
			)
		).json();

		const [model, input] = env.AI.run.mock.calls[0];
		expect(model).toBe('@cf/deepgram/nova-3');
		expect(input.language).toBe('en');
		expect(input.audio.contentType).toBe('audio/wav');
		expect(new Uint8Array(await new Response(input.audio.body).arrayBuffer())).toEqual(AUDIO_BYTES);
		expect(result.text).toBe('hello there');
		expect(result.words).toEqual([
			{ word: 'hello', start: 0, end: 0.4 },
			{ word: 'there', start: 0.5, end: 0.9 },
		]);
		expect(result.duration).toBe(0.9);
	});

	it('rejects the streaming-only deepgram flux model', async () => {
		const response = await transcriptionHandler(multipart({ model: '@cf/deepgram/flux' }), env);

		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('rejects unknown models, missing files, non-file values and wrong content types', async () => {
		expect((await transcriptionHandler(multipart({ model: 'nope' }), env)).status).toBe(400);
		expect((await transcriptionHandler(multipart({ model: 'whisper-1' }, { file: null }), env)).status).toBe(400);
		expect((await transcriptionHandler(multipart({ file: 'not-a-file' }, { file: null }), env)).status).toBe(400);
		expect((await transcriptionHandler(multipart({}, { file: audioFile(new Uint8Array()) }), env)).status).toBe(400);
		expect(
			(
				await transcriptionHandler(
					new Request('https://gateway.test/v1/audio/transcriptions', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: '{}',
					}),
					env,
				)
			).status,
		).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('lets Workers AI errors propagate to the shared error handler', async () => {
		env.AI.run.mockRejectedValue(new Error('3036: you have used up your daily free allocation'));

		const response = await transcriptionHandler(multipart(), env);

		expect(response.status).toBe(429);
	});
});

describe('translationHandler', () => {
	let env;

	beforeEach(() => {
		env = createEnv();
	});

	it('translates with a single whisper-large-v3-turbo call using task=translate', async () => {
		env.AI.run.mockResolvedValue({
			...TURBO_RESPONSE,
			transcription_info: { language: 'es', duration: 2.5 },
			text: ' Hello world',
		});

		const response = await translationHandler(multipart({ model: 'whisper-1', prompt: 'context' }), env);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ text: ' Hello world' });
		expect(env.AI.run).toHaveBeenCalledTimes(1);
		expect(env.AI.run).toHaveBeenCalledWith('@cf/openai/whisper-large-v3-turbo', {
			audio: AUDIO_BASE64,
			task: 'translate',
			initial_prompt: 'context',
		});
	});

	it('reports task=translate and english in verbose_json', async () => {
		env.AI.run.mockResolvedValue(TURBO_RESPONSE);

		const result = await (await translationHandler(multipart({ response_format: 'verbose_json' }), env)).json();

		expect(result).toMatchObject({ task: 'translate', language: 'english', duration: 2.5 });
	});

	it('chains legacy whisper + m2m100 using the client-provided language', async () => {
		env.AI.run
			.mockResolvedValueOnce({ text: 'Hola mundo', words: [{ word: 'Hola', start: 0, end: 1 }] })
			.mockResolvedValueOnce({ translated_text: 'Hello world' });

		const response = await translationHandler(multipart({ model: '@cf/openai/whisper', language: 'es' }), env);

		expect(await response.json()).toEqual({ text: 'Hello world' });
		expect(env.AI.run).toHaveBeenCalledTimes(2);
		expect(env.AI.run).toHaveBeenLastCalledWith('@cf/meta/m2m100-1.2b', {
			text: 'Hola mundo',
			source_lang: 'es',
			target_lang: 'en',
		});
	});

	it('skips m2m100 when legacy whisper audio is already English', async () => {
		env.AI.run.mockResolvedValueOnce({ text: 'Hello world', words: [] });

		const response = await translationHandler(multipart({ model: '@cf/openai/whisper', language: 'en' }), env);

		expect(await response.json()).toEqual({ text: 'Hello world' });
		expect(env.AI.run).toHaveBeenCalledTimes(1);
	});

	it('requires a language for legacy whisper, which does not report one', async () => {
		const response = await translationHandler(multipart({ model: '@cf/openai/whisper' }), env);

		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('rejects models that cannot translate', async () => {
		expect((await translationHandler(multipart({ model: 'whisper-tiny-en' }), env)).status).toBe(400);
		expect((await translationHandler(multipart({ model: '@cf/deepgram/nova-3' }), env)).status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('returns SRT for translations', async () => {
		env.AI.run.mockResolvedValue(TURBO_RESPONSE);

		const text = await (await translationHandler(multipart({ response_format: 'srt' }), env)).text();

		expect(text).toBe('1\n00:00:00,000 --> 00:00:02,500\nHello, world!\n');
	});
});

describe('speechHandler', () => {
	let env;

	beforeEach(() => {
		env = createEnv();
	});

	it('generates speech with melotts from base64 JSON output', async () => {
		env.AI.run.mockResolvedValue({ audio: AUDIO_BASE64 });

		const response = await speechHandler(jsonRequest({ model: 'tts-1', input: 'Hello, world!', voice: 'alloy' }), env);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(AUDIO_BYTES);
		expect(env.AI.run).toHaveBeenCalledWith('@cf/myshell-ai/melotts', { prompt: 'Hello, world!', lang: 'en' });
	});

	it('maps OpenAI voices to MeloTTS languages', async () => {
		env.AI.run.mockResolvedValue({ audio: AUDIO_BASE64 });

		for (const [voice, lang] of [['alloy', 'en'], ['echo', 'fr'], ['onyx', 'es'], ['shimmer', 'zh']]) {
			await speechHandler(jsonRequest({ input: 'Hi', voice }), env);
			expect(env.AI.run).toHaveBeenLastCalledWith('@cf/myshell-ai/melotts', { prompt: 'Hi', lang });
		}
	});

	it('rejects missing/oversized input, invalid voices, unsupported formats and speeds', async () => {
		const cases = [
			{ model: 'tts-1', voice: 'alloy' },
			{ input: 'x'.repeat(4097) },
			{ input: 'Hi', voice: 'invalid-voice' },
			{ input: 'Hi', response_format: 'wav' }, // melotts only produces mp3
			{ input: 'Hi', speed: 1.5 },
			{ input: 'Hi', speed: 9 },
			{ input: 'Hi', model: 'not-a-model' },
		];
		for (const body of cases) {
			expect((await speechHandler(jsonRequest(body), env)).status, JSON.stringify(body).slice(0, 40)).toBe(400);
		}
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('drives aura-2-en with encoding/container honouring response_format', async () => {
		env.AI.run.mockResolvedValue(new Response(AUDIO_BYTES).body);

		const response = await speechHandler(
			jsonRequest({ model: '@cf/deepgram/aura-2-en', input: 'Hello', voice: 'nova', response_format: 'wav' }),
			env,
		);

		expect(env.AI.run).toHaveBeenCalledWith('@cf/deepgram/aura-2-en', {
			text: 'Hello',
			speaker: 'luna',
			encoding: 'linear16',
			container: 'wav',
		});
		expect(response.headers.get('Content-Type')).toBe('audio/wav');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(AUDIO_BYTES);
	});

	it('accepts native Aura speakers and maps opus to ogg', async () => {
		env.AI.run.mockResolvedValue(new Response(AUDIO_BYTES).body);

		const response = await speechHandler(
			jsonRequest({ model: '@cf/deepgram/aura-2-es', input: 'Hola', voice: 'diana', response_format: 'opus' }),
			env,
		);

		expect(env.AI.run).toHaveBeenCalledWith('@cf/deepgram/aura-2-es', {
			text: 'Hola',
			speaker: 'diana',
			encoding: 'opus',
			container: 'ogg',
		});
		expect(response.headers.get('Content-Type')).toBe('audio/ogg');
	});

	it('rejects a speaker that does not exist for the model', async () => {
		const response = await speechHandler(
			jsonRequest({ model: '@cf/deepgram/aura-2-es', input: 'Hola', voice: 'luna' }),
			env,
		);

		expect(response.status).toBe(400);
	});

	describe('R2 clip cache', () => {
		const createBucket = () => {
			const objects = new Map();
			return {
				objects,
				get: vi.fn(async key => {
					const stored = objects.get(key);
					if (!stored) return null;
					return {
						body: new Response(stored.data).body,
						httpEtag: '"abc123"',
						writeHttpMetadata: headers => {
							headers.set('Content-Type', stored.options.httpMetadata.contentType);
							headers.set('Cache-Control', stored.options.httpMetadata.cacheControl);
						},
					};
				}),
				put: vi.fn(async (key, data, options) => {
					objects.set(key, { data, options });
					return { etag: 'abc123', size: data.byteLength, uploaded: new Date() };
				}),
			};
		};

		it('stores every clip and serves identical requests from R2 without calling the model', async () => {
			const bucket = createBucket();
			env = createEnv({ AUDIO_BUCKET: bucket });
			env.AI.run.mockResolvedValue({ audio: AUDIO_BASE64 });
			const body = { input: 'Hello', voice: 'alloy' };

			const first = await speechHandler(jsonRequest(body), env);
			expect(new Uint8Array(await first.arrayBuffer())).toEqual(AUDIO_BYTES);
			expect(bucket.put).toHaveBeenCalledTimes(1);
			const [key, , options] = bucket.put.mock.calls[0];
			expect(key).toMatch(/^tts\/[0-9a-f]{32}\.mp3$/);
			expect(options.httpMetadata.contentType).toBe('audio/mpeg');

			const second = await speechHandler(jsonRequest(body), env);
			expect(env.AI.run).toHaveBeenCalledTimes(1);
			expect(second.headers.get('ETag')).toBe('"abc123"');
			expect(second.headers.get('Content-Type')).toBe('audio/mpeg');
			expect(second.headers.get('Cache-Control')).toBe(first.headers.get('Cache-Control'));
			expect(new Uint8Array(await second.arrayBuffer())).toEqual(AUDIO_BYTES);
		});

		it('uses a different cache key per voice, format and model', async () => {
			const bucket = createBucket();
			env = createEnv({ AUDIO_BUCKET: bucket });
			env.AI.run.mockImplementation(async () => new Response(AUDIO_BYTES).body);

			await speechHandler(jsonRequest({ model: '@cf/deepgram/aura-1', input: 'Hi', voice: 'alloy' }), env);
			await speechHandler(jsonRequest({ model: '@cf/deepgram/aura-1', input: 'Hi', voice: 'echo' }), env);
			await speechHandler(jsonRequest({ model: '@cf/deepgram/aura-1', input: 'Hi', voice: 'alloy', response_format: 'flac' }), env);

			expect(new Set(bucket.put.mock.calls.map(call => call[0])).size).toBe(3);
		});

		it('waits on ctx.waitUntil for the R2 write when a context is provided', async () => {
			const bucket = createBucket();
			env = createEnv({ AUDIO_BUCKET: bucket });
			env.AI.run.mockResolvedValue({ audio: AUDIO_BASE64 });
			const ctx = { waitUntil: vi.fn() };

			const response = await speechHandler(jsonRequest({ input: 'Hello' }), env, ctx);

			expect(response.status).toBe(200);
			expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
		});

		it('still serves the clip when the R2 write fails', async () => {
			const bucket = createBucket();
			bucket.put.mockRejectedValue(new Error('r2 down'));
			env = createEnv({ AUDIO_BUCKET: bucket });
			env.AI.run.mockResolvedValue({ audio: AUDIO_BASE64 });
			vi.spyOn(console, 'error').mockImplementation(() => {});

			const response = await speechHandler(jsonRequest({ input: 'Hello' }), env);

			expect(response.status).toBe(200);
			expect(new Uint8Array(await response.arrayBuffer())).toEqual(AUDIO_BYTES);
		});
	});
});
