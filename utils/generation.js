// Shared request-parameter handling for /v1/chat/completions and /v1/completions
import { MODEL_CONTEXT_WINDOWS } from './models.js';
import { ValidationError } from './errors.js';

const DEFAULT_CONTEXT_WINDOW = 4096;
const MAX_DEFAULT_OUTPUT_TOKENS = 16384;
const MAX_STOP_SEQUENCES = 4;
// Workers AI documents `seed` as an integer in [1, 9999999999]
const MAX_SEED = 9999999999;

/**
 * Generate an OpenAI-style prefixed identifier (e.g. `chatcmpl-<32 hex>`).
 * @param {string} prefix
 * @returns {string}
 */
export function newResponseId(prefix) {
	return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
}

const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Validate the `stop` parameter and return a list of stop sequences (or null).
 * Stop sequences are enforced by the gateway (the Workers AI text-generation
 * schemas do not all accept `stop`), so they behave the same on every model.
 * @param {*} stop
 * @returns {string[]|null}
 */
export function parseStopSequences(stop) {
	if (stop === undefined || stop === null) return null;
	const list = Array.isArray(stop) ? stop : [stop];
	if (list.length === 0) return null;
	if (list.length > MAX_STOP_SEQUENCES || list.some(s => typeof s !== 'string' || s.length === 0)) {
		throw new ValidationError(`stop must be a non-empty string or an array of up to ${MAX_STOP_SEQUENCES} non-empty strings`, 'stop');
	}
	return list;
}

/**
 * Truncate text at the earliest stop sequence.
 * @param {string} text
 * @param {string[]|null} stops
 * @returns {{text: string, stopped: boolean}}
 */
export function applyStop(text, stops) {
	if (!stops || typeof text !== 'string') return { text, stopped: false };
	let cut = -1;
	for (const stop of stops) {
		const index = text.indexOf(stop);
		if (index !== -1 && (cut === -1 || index < cut)) cut = index;
	}
	return cut === -1 ? { text, stopped: false } : { text: text.slice(0, cut), stopped: true };
}

/**
 * Validate and normalize the sampling/length parameters shared by chat and
 * completion requests.
 * @param {Object} json - Parsed request body
 * @param {string} model - Resolved Workers AI model id
 * @returns {{
 *   maxTokens: number,
 *   params: Object,
 *   stop: (string[]|null),
 *   includeUsage: boolean
 * }} `params` contains only keys that are forwarded to env.AI.run()
 */
export function resolveGenerationParams(json, model) {
	if (json.n !== undefined && json.n !== null && json.n !== 1) {
		throw new ValidationError('Only n=1 is supported', 'n');
	}

	const contextWindow = MODEL_CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;

	const requestedMax = json.max_completion_tokens ?? json.max_tokens;
	const maxTokens =
		isNumber(requestedMax) && requestedMax >= 1
			? Math.min(Math.floor(requestedMax), contextWindow)
			: Math.max(1, Math.min(Math.floor(contextWindow * 0.7), MAX_DEFAULT_OUTPUT_TOKENS));

	const params = {
		max_tokens: maxTokens,
		temperature: isNumber(json.temperature) ? clamp(json.temperature, 0, 2) : 0.7,
		top_p: isNumber(json.top_p) ? clamp(json.top_p, 0.001, 1) : 0.9,
	};

	if (isNumber(json.seed)) {
		const seed = Math.abs(Math.trunc(json.seed));
		params.seed = seed >= 1 && seed <= MAX_SEED ? seed : (seed % MAX_SEED) + 1;
	}
	if (isNumber(json.frequency_penalty)) {
		params.frequency_penalty = clamp(json.frequency_penalty, -2, 2);
	}
	if (isNumber(json.presence_penalty)) {
		params.presence_penalty = clamp(json.presence_penalty, -2, 2);
	}

	const format = json.response_format;
	if (format !== undefined && format !== null) {
		if (typeof format !== 'object' || !['text', 'json_object', 'json_schema'].includes(format.type)) {
			throw new ValidationError('response_format.type must be one of: text, json_object, json_schema', 'response_format');
		}
		if (format.type !== 'text') params.response_format = format;
	}

	return {
		maxTokens,
		params,
		stop: parseStopSequences(json.stop),
		includeUsage: json.stream_options?.include_usage === true,
	};
}
