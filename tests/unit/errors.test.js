import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	APIError,
	PermissionError,
	RateLimitError,
	ValidationError,
	asyncErrorHandler,
	mapUpstreamError,
} from '../../utils/errors.js';

afterEach(() => vi.restoreAllMocks());

const failing = message =>
	asyncErrorHandler(() => {
		throw new Error(message);
	});

const makeRequest = () =>
	new Request('https://gateway.test/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': 'Bearer super-secret',
			'Cookie': 'session=abc',
			'Content-Type': 'application/json',
			'User-Agent': 'vitest',
		},
	});

describe('Workers AI error mapping', () => {
	it.each([
		['3036: you have used up your daily free allocation of 10,000 neurons', 429, 'rate_limit_exceeded'],
		['3040: capacity temporarily exceeded', 429, 'rate_limit_exceeded'],
		['3006: request is too large', 413, 'invalid_request_error'],
		['5006: Error: oneOf at \'/\' not met', 400, 'invalid_request_error'],
		['5007: No such model @cf/foo/bar', 400, 'invalid_request_error'],
		['5004: invalid data', 400, 'invalid_request_error'],
		['3003: incomplete request', 400, 'invalid_request_error'],
		['5035: model requires paid plan', 403, 'permission_error'],
		['5016: model agreement required', 403, 'permission_error'],
		['AiError: Bad input: missing prompt', 400, 'invalid_request_error'],
	])('maps "%s" to %i', async (message, status, type) => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await failing(message)(makeRequest(), {});
		expect(res.status).toBe(status);
		expect((await res.json()).error.type).toBe(type);
	});

	it('uses proper subclasses', () => {
		expect(mapUpstreamError(new Error('3036: x'))).toBeInstanceOf(RateLimitError);
		expect(mapUpstreamError(new Error('5007: x'))).toBeInstanceOf(ValidationError);
		expect(mapUpstreamError(new Error('5035: x'))).toBeInstanceOf(PermissionError);
	});

	it('reads the code from error.code too', () => {
		const err = Object.assign(new Error('capacity'), { code: 3040 });
		expect(mapUpstreamError(err)).toBeInstanceOf(RateLimitError);
	});

	it('passes APIError and unknown errors through unchanged', () => {
		const api = new APIError('boom', 'server_error', 502);
		expect(mapUpstreamError(api)).toBe(api);
		const unknown = new Error('something else');
		expect(mapUpstreamError(unknown)).toBe(unknown);
	});

	it('returns 400 for malformed JSON bodies', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const handler = asyncErrorHandler(() => JSON.parse('{nope'));
		const res = await handler(makeRequest(), {});
		expect(res.status).toBe(400);
	});

	it('returns 500 for unknown errors', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await failing('kaboom')(makeRequest(), {});
		expect(res.status).toBe(500);
	});
});

describe('error logging', () => {
	it('never logs the authorization header or cookies', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		await failing('3036: out of neurons')(makeRequest(), {});
		await failing('kaboom')(makeRequest(), {});

		const logged = [...warn.mock.calls, ...error.mock.calls].flat().join(' ');
		expect(logged).not.toMatch(/super-secret/);
		expect(logged).not.toMatch(/authorization/i);
		expect(logged).not.toMatch(/session=abc/);
		expect(logged).toMatch(/user-agent/i);
	});

	it('omits stack traces for client errors but keeps them for 5xx', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		await failing('5007: no such model')(makeRequest(), {});
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0].join(' ')).not.toMatch(/"stack"/);

		await failing('kaboom')(makeRequest(), {});
		expect(error).toHaveBeenCalledTimes(1);
		expect(error.mock.calls[0].join(' ')).toMatch(/"stack"/);
	});
});
