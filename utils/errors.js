// Comprehensive error handling utilities for OpenAI-compatible API

export class APIError extends Error {
	constructor(message, type = 'api_error', status = 500, code = null) {
		super(message);
		this.name = 'APIError';
		this.type = type;
		this.status = status;
		this.code = code;
	}
}

// Specific error types
export class ValidationError extends APIError {
	constructor(message, param = null) {
		super(message, 'invalid_request_error', 400);
		this.param = param;
	}
}

export class AuthenticationError extends APIError {
	constructor(message = 'Invalid authentication credentials') {
		super(message, 'authentication_error', 401);
	}
}

export class PermissionError extends APIError {
	constructor(message = 'Insufficient permissions') {
		super(message, 'permission_error', 403);
	}
}

export class NotFoundError extends APIError {
	constructor(message = 'Resource not found') {
		super(message, 'not_found_error', 404);
	}
}

export class RateLimitError extends APIError {
	constructor(message = 'Rate limit exceeded') {
		super(message, 'rate_limit_exceeded', 429);
	}
}

export class ServerError extends APIError {
	constructor(message = 'Internal server error') {
		super(message, 'server_error', 500);
	}
}

// Error response formatters
export function createErrorResponse(error, status = null) {
	if (error instanceof APIError) {
		const errorBody = {
			error: {
				message: error.message,
				type: error.type,
			},
		};

		if (error.code) {
			errorBody.error.code = error.code;
		}

		if (error.param) {
			errorBody.error.param = error.param;
		}

		return new Response(JSON.stringify(errorBody), {
			status: status || error.status,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
			},
		});
	}

	// Handle generic errors
	const errorBody = {
		error: {
			message: error.message || 'An unexpected error occurred',
			type: 'server_error',
		},
	};

	return new Response(JSON.stringify(errorBody), {
		status: status || 500,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
		},
	});
}


// Workers AI internal error codes -> OpenAI-style errors.
// https://developers.cloudflare.com/workers-ai/platform/errors/
const WORKERS_AI_ERROR_STATUS = {
	3003: 400, // Incomplete request
	3006: 413, // Request too large
	3007: 408, // Timeout
	3008: 408, // Aborted
	3023: 403, // Account blocked
	3036: 429, // Daily free neuron allocation used up
	3040: 429, // Out of capacity
	3041: 403, // Account not allowed for private model
	3042: 404, // Invalid model ID
	5004: 400, // Invalid data
	5005: 405, // LoRa unsupported
	5006: 400, // Input schema validation failed
	5007: 400, // No such model
	5016: 403, // Model agreement required
	5018: 403, // Account not allowed for private model
	5035: 403, // Model requires Workers Paid plan
};

export function mapUpstreamError(error) {
	if (error instanceof APIError) return error;
	const message = String(error?.message ?? '');
	const match = /\b([35]\d{3})\b/.exec(`${error?.code ?? ''} ${message}`);
	let status = match ? WORKERS_AI_ERROR_STATUS[match[1]] : undefined;
	if (!status && /bad input/i.test(message)) status = 400;
	if (!status) return error;
	const code = match ? match[1] : null;
	if (status === 400) return new ValidationError(message);
	if (status === 403) return new PermissionError(message);
	if (status === 404) return new NotFoundError(message);
	if (status === 429) return new RateLimitError(message);
	return new APIError(message, 'invalid_request_error', status, code);
}

// Only these request headers may ever reach the logs (never authorization/cookies).
const LOGGED_HEADERS = ['content-type', 'cf-ray', 'user-agent'];

function pickHeaders(headers) {
	const out = {};
	if (!headers?.get) return out;
	for (const name of LOGGED_HEADERS) {
		const value = headers.get(name);
		if (value) out[name] = value;
	}
	return out;
}

function requestContext(request) {
	return { url: request?.url, method: request?.method, headers: pickHeaders(request?.headers) };
}

export function logError(error, context = {}) {
	const status = error instanceof APIError ? error.status : 500;
	const logData = {
		timestamp: new Date().toISOString(),
		error: { name: error.name, message: error.message },
		context,
	};

	if (error instanceof APIError) {
		logData.error.type = error.type;
		logData.error.status = error.status;
		logData.error.code = error.code;
		logData.error.param = error.param;
	}

	if (status >= 500) {
		logData.error.stack = error.stack;
		console.error('API Error:', JSON.stringify(logData));
	} else {
		console.warn('API Client Error:', JSON.stringify(logData));
	}
}

// Async error wrapper
export function asyncErrorHandler(handler) {
	return async (request, env, ctx) => {
		try {
			return await handler(request, env, ctx);
		} catch (error) {
			return handleError(error, request);
		}
	};
}

// Convert any thrown value into an OpenAI-style error response (also used by the router catch).
export function handleError(error, request) {
	let mapped;
	if (error instanceof SyntaxError && error.message.includes('JSON')) {
		mapped = new ValidationError('Invalid JSON in request body: ' + error.message);
	} else {
		mapped = mapUpstreamError(error);
	}
	logError(mapped, requestContext(request));
	return createErrorResponse(mapped);
}
