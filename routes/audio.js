// OpenAI-compatible Audio Handler for Cloudflare Workers AI
// Speech-to-text, translation and text-to-speech. Every supported model has an explicit adapter
// (input builder + output parser) matching its published Workers AI schema; models without an
// adapter are rejected with a 400 instead of being sent input they cannot parse.

import { storeFile, getFile, createCachedResponse } from '../utils/r2Storage.js';
import { arrayBufferToBase64, createSegmentsFromWords } from '../utils/format.js';
import { base64ToBytes, sha256Hex } from '../utils/binary.js';
import { resolveModel } from '../utils/models.js';
import { APIError, asyncErrorHandler, ServerError, ValidationError } from '../utils/errors.js';

// OpenAI's upload limit.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
// @cf/openai/whisper and whisper-tiny-en take the audio as a JSON array of byte values, which costs
// several bytes of isolate memory per input byte; keep that path small.
const MAX_LEGACY_WHISPER_BYTES = 2 * 1024 * 1024;
// OpenAI's maximum TTS input length.
const MAX_TTS_INPUT_CHARS = 4096;
const TTS_CACHE_CONTROL = 'private, max-age=86400';

// --- Speech-to-text adapters --------------------------------------------------

const numberOrUndefined = value => (typeof value === 'number' ? value : undefined);

/** Normalise a Whisper-style segment list (id from index, optional OpenAI diagnostics passed through). */
function normaliseSegments(rawSegments) {
	return rawSegments.map((segment, index) => {
		const out = { id: index, start: segment.start, end: segment.end, text: segment.text ?? '' };
		for (const key of ['temperature', 'avg_logprob', 'compression_ratio', 'no_speech_prob']) {
			if (numberOrUndefined(segment[key]) !== undefined) out[key] = segment[key];
		}
		return out;
	});
}

const normaliseWords = rawWords =>
	rawWords.map(w => ({ word: String(w.word ?? '').trim(), start: w.start, end: w.end }));

/** Last known timestamp, used when a model does not report the audio duration. */
function lastEnd(words, segments) {
	return segments.at(-1)?.end ?? words.at(-1)?.end ?? 0;
}

const turboAdapter = {
	translate: 'native',
	async buildInput({ file, language, prompt, task }) {
		const input = { audio: arrayBufferToBase64(await file.arrayBuffer()) };
		if (task === 'translate') input.task = 'translate';
		if (language) input.language = language;
		if (prompt) input.initial_prompt = prompt;
		return input;
	},
	parse(response, { language }) {
		const segments = normaliseSegments(Array.isArray(response.segments) ? response.segments : []);
		const words = normaliseWords((response.segments ?? []).flatMap(s => s.words ?? []));
		return {
			text: response.text ?? '',
			language: response.transcription_info?.language ?? language ?? 'unknown',
			duration: response.transcription_info?.duration ?? lastEnd(words, segments),
			words,
			segments,
			vtt: response.vtt,
		};
	},
};

const legacyWhisperAdapter = (translate, fixedLanguage) => ({
	translate,
	maxBytes: MAX_LEGACY_WHISPER_BYTES,
	async buildInput({ file }) {
		return { audio: Array.from(new Uint8Array(await file.arrayBuffer())) };
	},
	parse(response, { language }) {
		const words = normaliseWords(Array.isArray(response.words) ? response.words : []);
		const segments = createSegmentsFromWords(words);
		return {
			text: response.text ?? '',
			language: response.transcription_info?.language ?? fixedLanguage ?? language ?? 'unknown',
			duration: lastEnd(words, segments),
			words,
			segments,
			vtt: response.vtt,
		};
	},
});

const novaAdapter = {
	translate: 'none',
	async buildInput({ file, language }) {
		const input = {
			// Streamed straight from the upload: no copy of the audio in isolate memory.
			audio: { body: file.stream(), contentType: file.type || 'application/octet-stream' },
		};
		if (language) input.language = language;
		return input;
	},
	parse(response, { language }) {
		const alternative = response.results?.channels?.[0]?.alternatives?.[0] ?? {};
		const words = normaliseWords(alternative.words ?? []);
		const segments = createSegmentsFromWords(words);
		return {
			text: alternative.transcript ?? '',
			language: language ?? 'unknown',
			duration: lastEnd(words, segments),
			words,
			segments,
			vtt: undefined,
		};
	},
};

const STT_ADAPTERS = {
	'@cf/openai/whisper-large-v3-turbo': turboAdapter,
	// Original Whisper does not report the spoken language; translation needs it from the client.
	'@cf/openai/whisper': legacyWhisperAdapter('chain'),
	'@cf/openai/whisper-tiny-en': legacyWhisperAdapter('none', 'en'),
	'@cf/deepgram/nova-3': novaAdapter,
};

function getSttAdapter(model) {
	const adapter = STT_ADAPTERS[model];
	if (!adapter) {
		throw new ValidationError(
			`Model ${model} is not supported by this endpoint. Supported: ${Object.keys(STT_ADAPTERS).join(', ')}`,
			'model',
		);
	}
	return adapter;
}

// --- Request parsing ----------------------------------------------------------

function requireMultipart(request) {
	if (!request.headers.get('Content-Type')?.includes('multipart/form-data')) {
		throw new ValidationError('Content-Type must be multipart/form-data');
	}
}

function readAudioFile(formData, maxBytes = MAX_AUDIO_BYTES) {
	const file = formData.get('file');
	if (file === null || file === undefined || file === '') {
		throw new ValidationError('No audio file provided', 'file');
	}
	if (typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
		throw new ValidationError('file must be an uploaded audio file', 'file');
	}
	if (file.size === 0) {
		throw new ValidationError('Audio file is empty', 'file');
	}
	if (file.size > maxBytes) {
		throw new APIError(
			`Audio file exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit for this model`,
			'invalid_request_error',
			413,
		);
	}
	return file;
}

const optionalString = (formData, name) => {
	const value = formData.get(name);
	return typeof value === 'string' && value.length > 0 ? value : undefined;
};

function readGranularities(formData) {
	// OpenAI SDKs send the array form `timestamp_granularities[]`.
	const values = [...formData.getAll('timestamp_granularities[]'), ...formData.getAll('timestamp_granularities')];
	for (const value of values) {
		if (value !== 'word' && value !== 'segment') {
			throw new ValidationError('timestamp_granularities must contain only "word" and/or "segment"', 'timestamp_granularities');
		}
	}
	return new Set(values);
}

const RESPONSE_FORMATS = ['json', 'text', 'srt', 'verbose_json', 'vtt'];

function readResponseFormat(formData) {
	const format = optionalString(formData, 'response_format') ?? 'json';
	if (!RESPONSE_FORMATS.includes(format)) {
		throw new ValidationError(`response_format must be one of: ${RESPONSE_FORMATS.join(', ')}`, 'response_format');
	}
	return format;
}

function validateTemperature(formData) {
	const raw = optionalString(formData, 'temperature');
	if (raw !== undefined) {
		const value = Number(raw);
		if (!Number.isFinite(value) || value < 0 || value > 1) {
			throw new ValidationError('temperature must be a number between 0 and 1', 'temperature');
		}
	}
}

// --- Output formatting --------------------------------------------------------

const pad = (value, width = 2) => String(value).padStart(width, '0');

function formatTimestamp(seconds, separator) {
	const total = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
	const hours = Math.floor(total / 3600000);
	const minutes = Math.floor((total % 3600000) / 60000);
	const secs = Math.floor((total % 60000) / 1000);
	return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(total % 1000, 3)}`;
}

function buildSubtitles(result, format) {
	let segments = result.segments;
	if (segments.length === 0 && result.text.trim()) {
		// No timing information at all: emit one cue spanning the whole clip.
		segments = [{ start: 0, end: result.duration, text: result.text }];
	}
	const separator = format === 'srt' ? ',' : '.';
	const cues = segments.map((segment, index) => {
		const timing = `${formatTimestamp(segment.start, separator)} --> ${formatTimestamp(segment.end, separator)}`;
		const text = String(segment.text).trim();
		return format === 'srt' ? `${index + 1}\n${timing}\n${text}\n` : `${timing}\n${text}\n`;
	});
	return format === 'srt' ? cues.join('\n') : `WEBVTT\n\n${cues.join('\n')}`;
}

function formatTranscript(result, { format, task, granularities }) {
	switch (format) {
	case 'text':
		return new Response(result.text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
	case 'srt':
		return new Response(buildSubtitles(result, 'srt'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
	case 'vtt':
		return new Response(result.vtt || buildSubtitles(result, 'vtt'), {
			headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
		});
	case 'verbose_json': {
		const body = { task, language: result.language, duration: result.duration, text: result.text };
		const wantWords = granularities.has('word');
		// OpenAI returns segments unless only word timestamps were requested.
		const wantSegments = granularities.has('segment') || !wantWords;
		if (wantWords) body.words = result.words;
		if (wantSegments) body.segments = result.segments;
		return Response.json(body);
	}
	default:
		return Response.json({ text: result.text });
	}
}

// --- Handlers: transcription / translation -----------------------------------

// POST /audio/transcriptions
export const transcriptionHandler = asyncErrorHandler(async (request, env) => {
	requireMultipart(request);
	const formData = await request.formData();

	const model = resolveModel('audio_stt', optionalString(formData, 'model'));
	const adapter = getSttAdapter(model);
	const file = readAudioFile(formData, adapter.maxBytes);
	const format = readResponseFormat(formData);
	const granularities = readGranularities(formData);
	validateTemperature(formData);
	const language = optionalString(formData, 'language');
	const prompt = optionalString(formData, 'prompt');

	const input = await adapter.buildInput({ file, language, prompt, task: 'transcribe' });
	const response = await env.AI.run(model, input);
	const result = adapter.parse(response ?? {}, { language });

	return formatTranscript(result, { format, task: 'transcribe', granularities });
});

// POST /audio/translations (always translates into English)
export const translationHandler = asyncErrorHandler(async (request, env) => {
	requireMultipart(request);
	const formData = await request.formData();

	const model = resolveModel('audio_stt', optionalString(formData, 'model'));
	const adapter = getSttAdapter(model);
	if (adapter.translate === 'none') {
		throw new ValidationError(`Model ${model} cannot translate audio. Use whisper-1 (whisper-large-v3-turbo).`, 'model');
	}
	const file = readAudioFile(formData, adapter.maxBytes);
	const format = readResponseFormat(formData);
	const granularities = readGranularities(formData);
	validateTemperature(formData);
	const language = optionalString(formData, 'language');
	const prompt = optionalString(formData, 'prompt');

	if (adapter.translate === 'native') {
		// whisper-large-v3-turbo translates in a single call.
		const input = await adapter.buildInput({ file, language, prompt, task: 'translate' });
		const result = adapter.parse((await env.AI.run(model, input)) ?? {}, { language });
		return formatTranscript({ ...result, language: 'english' }, { format, task: 'translate', granularities });
	}

	// Legacy Whisper cannot translate and does not report the spoken language: transcribe, then run
	// m2m100 with the source language supplied by the client via `language`.
	const sourceLanguage = language?.toLowerCase();
	if (!sourceLanguage || !/^[a-z]{2,3}$/.test(sourceLanguage)) {
		throw new ValidationError(
			`Model ${model} does not report the spoken language. Pass \`language\` (ISO code, e.g. "es") or use whisper-large-v3-turbo.`,
			'language',
		);
	}
	const transcribeInput = await adapter.buildInput({ file, language: sourceLanguage, prompt, task: 'transcribe' });
	const transcription = adapter.parse((await env.AI.run(model, transcribeInput)) ?? {}, { language: sourceLanguage });

	let translatedText = transcription.text;
	if (sourceLanguage !== 'en') {
		const translation = await env.AI.run('@cf/meta/m2m100-1.2b', {
			text: transcription.text,
			source_lang: sourceLanguage,
			target_lang: 'en',
		});
		if (typeof translation?.translated_text !== 'string') {
			throw new ServerError('Translation failed');
		}
		translatedText = translation.translated_text;
	}

	// Segment timings belong to the source language, so they are not reused for the translation.
	return formatTranscript(
		{ ...transcription, text: translatedText, language: 'english', segments: [], words: [], vtt: undefined },
		{ format, task: 'translate', granularities },
	);
});

// --- Text-to-speech adapters --------------------------------------------------

// OpenAI voices -> MeloTTS has no timbres, so voices select the language instead.
const MELO_VOICE_LANGUAGE = {
	alloy: 'en',
	echo: 'fr',
	fable: 'en',
	onyx: 'es',
	nova: 'en',
	shimmer: 'zh',
};

const OPENAI_VOICES = Object.keys(MELO_VOICE_LANGUAGE);

/** OpenAI response_format -> Deepgram Aura encoding/container + resulting content type. */
const AURA_FORMATS = {
	mp3: { params: { encoding: 'mp3' }, contentType: 'audio/mpeg', extension: 'mp3' },
	opus: { params: { encoding: 'opus', container: 'ogg' }, contentType: 'audio/ogg', extension: 'ogg' },
	aac: { params: { encoding: 'aac' }, contentType: 'audio/aac', extension: 'aac' },
	flac: { params: { encoding: 'flac' }, contentType: 'audio/flac', extension: 'flac' },
	wav: { params: { encoding: 'linear16', container: 'wav' }, contentType: 'audio/wav', extension: 'wav' },
	pcm: { params: { encoding: 'linear16', container: 'none' }, contentType: 'audio/pcm', extension: 'pcm' },
};

const MELO_FORMATS = {
	mp3: { contentType: 'audio/mpeg', extension: 'mp3' },
};

const auraAdapter = (speakers, openaiVoices) => ({
	formats: AURA_FORMATS,
	voices: [...Object.keys(openaiVoices), ...speakers],
	buildInput({ input, voice, format }) {
		const speaker = openaiVoices[voice] ?? voice;
		return { text: input, speaker, ...AURA_FORMATS[format].params };
	},
});

const TTS_ADAPTERS = {
	'@cf/myshell-ai/melotts': {
		formats: MELO_FORMATS,
		voices: OPENAI_VOICES,
		buildInput: ({ input, voice }) => ({ prompt: input, lang: MELO_VOICE_LANGUAGE[voice] }),
	},
	'@cf/deepgram/aura-1': auraAdapter(
		['angus', 'asteria', 'arcas', 'orion', 'orpheus', 'athena', 'luna', 'zeus', 'perseus', 'helios', 'hera', 'stella'],
		{ alloy: 'asteria', echo: 'orion', fable: 'angus', onyx: 'zeus', nova: 'luna', shimmer: 'stella' },
	),
	'@cf/deepgram/aura-2-en': auraAdapter(
		[
			'amalthea', 'andromeda', 'apollo', 'arcas', 'aries', 'asteria', 'athena', 'atlas', 'aurora', 'callista',
			'cora', 'cordelia', 'delia', 'draco', 'electra', 'harmonia', 'helena', 'hera', 'hermes', 'hyperion',
			'iris', 'janus', 'juno', 'jupiter', 'luna', 'mars', 'minerva', 'neptune', 'odysseus', 'ophelia',
			'orion', 'orpheus', 'pandora', 'phoebe', 'pluto', 'saturn', 'thalia', 'theia', 'vesta', 'zeus',
		],
		{ alloy: 'asteria', echo: 'orion', fable: 'apollo', onyx: 'zeus', nova: 'luna', shimmer: 'hera' },
	),
	'@cf/deepgram/aura-2-es': auraAdapter(
		['sirio', 'nestor', 'carina', 'celeste', 'alvaro', 'diana', 'aquila', 'selena', 'estrella', 'javier'],
		{ alloy: 'aquila', echo: 'alvaro', fable: 'nestor', onyx: 'sirio', nova: 'carina', shimmer: 'celeste' },
	),
};

/** Turn any TTS model output (base64 JSON, stream, buffer) into a ReadableStream or Uint8Array. */
function readSpeechOutput(response) {
	if (response instanceof ReadableStream) return response;
	if (response instanceof Response) return response.body;
	if (response instanceof ArrayBuffer) return new Uint8Array(response);
	if (ArrayBuffer.isView(response)) return new Uint8Array(response.buffer, response.byteOffset, response.byteLength);
	if (typeof response?.audio === 'string') return base64ToBytes(response.audio);
	throw new ServerError('Text-to-speech model returned an unexpected response');
}

const ttsHeaders = (contentType, extension) => ({
	'Content-Type': contentType,
	'Content-Disposition': `attachment; filename="speech.${extension}"`,
	'Cache-Control': TTS_CACHE_CONTROL,
});

// POST /audio/speech
export const speechHandler = asyncErrorHandler(async (request, env, ctx) => {
	const body = await request.json();
	if (!body || typeof body !== 'object') {
		throw new ValidationError('Request body must be a JSON object');
	}

	const { input, voice = 'alloy', response_format = 'mp3', speed } = body;

	if (typeof input !== 'string' || input.length === 0) {
		throw new ValidationError('No input text provided', 'input');
	}
	if (input.length > MAX_TTS_INPUT_CHARS) {
		throw new ValidationError(`input must be at most ${MAX_TTS_INPUT_CHARS} characters`, 'input');
	}

	const model = resolveModel('audio_tts', body.model);
	const adapter = TTS_ADAPTERS[model];
	if (!adapter) {
		throw new ValidationError(
			`Model ${model} is not supported by this endpoint. Supported: ${Object.keys(TTS_ADAPTERS).join(', ')}`,
			'model',
		);
	}

	if (typeof voice !== 'string' || !adapter.voices.includes(voice)) {
		throw new ValidationError(`Invalid voice. Must be one of: ${adapter.voices.join(', ')}`, 'voice');
	}

	const format = adapter.formats[response_format];
	if (!format) {
		throw new ValidationError(
			`response_format ${JSON.stringify(response_format)} is not supported by ${model}. Supported: ${Object.keys(adapter.formats).join(', ')}`,
			'response_format',
		);
	}

	if (speed !== undefined && speed !== null) {
		if (typeof speed !== 'number' || speed < 0.25 || speed > 4) {
			throw new ValidationError('speed must be a number between 0.25 and 4.0', 'speed');
		}
		if (speed !== 1) {
			throw new ValidationError(`${model} does not support the speed parameter`, 'speed');
		}
	}

	// Cache policy: every generated clip is stored in R2 (when bound) under a key derived from all
	// parameters that influence the audio, and served from there on the next identical request.
	let audioKey = null;
	if (env.AUDIO_BUCKET) {
		const digest = await sha256Hex(JSON.stringify([model, voice, response_format, input]));
		audioKey = `tts/${digest.slice(0, 32)}.${format.extension}`;
		const cached = await getFile(env.AUDIO_BUCKET, audioKey);
		if (cached) {
			const response = createCachedResponse(cached, request);
			response.headers.set('Content-Disposition', `attachment; filename="speech.${format.extension}"`);
			return response;
		}
	}

	const aiResponse = await env.AI.run(model, adapter.buildInput({ input, voice, format: response_format }));
	let audio = readSpeechOutput(aiResponse);

	if (audioKey) {
		if (audio instanceof ReadableStream) {
			audio = new Uint8Array(await new Response(audio).arrayBuffer());
		}
		const store = storeFile(env.AUDIO_BUCKET, audioKey, audio, {
			contentType: format.contentType,
			cacheControl: TTS_CACHE_CONTROL,
			custom: { model, voice, format: response_format, input: input.slice(0, 100) },
		}).catch(error => console.error('Failed to store audio in R2:', error));
		if (typeof ctx?.waitUntil === 'function') {
			ctx.waitUntil(store);
		} else {
			await store;
		}
	}

	return new Response(audio, { headers: ttsHeaders(format.contentType, format.extension) });
});
