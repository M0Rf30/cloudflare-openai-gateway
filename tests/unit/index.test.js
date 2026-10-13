import { describe, it, expect } from 'vitest';
import worker from '../../index';

const TOKEN = 'test-secret-token';
const env = { ACCESS_TOKEN: TOKEN, ENVIRONMENT: 'test' };

const call = (path, init = {}, e = env) =>
	worker.fetch(new Request(`https://gateway.test${path}`, init), e, {});

const authed = (token = TOKEN, scheme = 'Bearer') => ({
	headers: { Authorization: `${scheme} ${token}` },
});

describe('index router', () => {
	describe('authentication', () => {
		it('returns 401 authentication_error when the Authorization header is missing', async () => {
			const res = await call('/v1/models');
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.error.type).toBe('authentication_error');
		});

		it('returns 401 for an invalid token', async () => {
			const res = await call('/v1/models', authed('wrong-token'));
			expect(res.status).toBe(401);
			expect((await res.json()).error.message).toMatch(/invalid api key/i);
		});

		it('returns 401 for a non-Bearer scheme', async () => {
			const res = await call('/v1/models', authed(TOKEN, 'Basic'));
			expect(res.status).toBe(401);
		});

		it('fails closed when ACCESS_TOKEN is not configured', async () => {
			const res = await call('/v1/models', authed(''), { ENVIRONMENT: 'test' });
			expect(res.status).toBe(401);
			const res2 = await call('/v1/models', authed('undefined'), { ENVIRONMENT: 'test' });
			expect(res2.status).toBe(401);
		});

		it('accepts a valid token', async () => {
			const res = await call('/v1/models', authed());
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.object).toBe('list');
		});

		it('accepts a lowercase "bearer" scheme', async () => {
			const res = await call('/v1/models', authed(TOKEN, 'bearer'));
			expect(res.status).toBe(200);
		});

		it('does not require bearer auth for GET /v1/images/get/:name', async () => {
			const res = await call('/v1/images/get/some-image.png');
			expect(res.status).not.toBe(401);
		});

		it('still requires bearer auth for other methods on /v1/images/get/:name', async () => {
			const res = await call('/v1/images/get/some-image.png', { method: 'POST' });
			expect(res.status).toBe(401);
		});
	});

	describe('CORS', () => {
		it('answers OPTIONS preflight without authentication', async () => {
			const res = await call('/v1/chat/completions', {
				method: 'OPTIONS',
				headers: {
					'Origin': 'https://app.example',
					'Access-Control-Request-Method': 'POST',
					'Access-Control-Request-Headers': 'authorization,content-type',
				},
			});
			expect(res.status).toBe(204);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
			expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/POST/);
			expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/authorization/i);
		});

		it('adds Access-Control-Allow-Origin to successful responses', async () => {
			const res = await call('/v1/models', {
				...authed(),
				headers: { ...authed().headers, Origin: 'https://app.example' },
			});
			expect(res.status).toBe(200);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
		});

		it('adds Access-Control-Allow-Origin to auth error responses', async () => {
			const res = await call('/v1/models', { headers: { Origin: 'https://app.example' } });
			expect(res.status).toBe(401);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
		});

		it('adds Access-Control-Allow-Origin to router 404 responses', async () => {
			const res = await call('/v1/nope', {
				headers: { ...authed().headers, Origin: 'https://app.example' },
			});
			expect(res.status).toBe(404);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
		});
	});

	describe('errors', () => {
		it('returns a JSON 404 for unknown /v1 endpoints', async () => {
			const res = await call('/v1/nope', authed());
			expect(res.status).toBe(404);
			expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
			expect((await res.json()).error.type).toBe('not_found_error');
		});

		it('returns a JSON 404 outside /v1', async () => {
			const res = await call('/elsewhere');
			expect(res.status).toBe(404);
			expect((await res.json()).error.type).toBe('not_found_error');
			expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
		});

		it('converts handler failures to OpenAI-style errors with CORS', async () => {
			// No Cloudflare API secrets and not a test env: the models route reports misconfiguration.
			const res = await call('/v1/models', authed(), { ACCESS_TOKEN: TOKEN });
			expect(res.status).toBe(500);
			const body = await res.json();
			expect(body.error.type).toBe('server_error');
			expect(body.error.message).toMatch(/CLOUDFLARE_API_TOKEN/);
			expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
		});
	});

	describe('root', () => {
		it('lists endpoints including systemone and the right repository', async () => {
			const res = await call('/');
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.endpoints.systemone).toBe('/v1/systemone');
			expect(body.documentation).toBe('https://github.com/M0Rf30/cloudflare-openai-gateway');
		});
	});
});
