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

// Legacy compatibility functions
export function createSuccessResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
		},
	});
}

// Validation helpers
export function validateRequired(value, fieldName) {
	if (value === undefined || value === null || value === '') {
		throw new ValidationError(`Missing required parameter: ${fieldName}`, fieldName);
	}
	return value;
}

export function validateString(value, fieldName, minLength = 0, maxLength = Infinity) {
	if (typeof value !== 'string') {
		throw new ValidationError(`Parameter ${fieldName} must be a string`, fieldName);
	}
	if (value.length < minLength) {
		throw new ValidationError(
			`Parameter ${fieldName} must be at least ${minLength} characters`,
			fieldName,
		);
	}
	if (value.length > maxLength) {
		throw new ValidationError(
			`Parameter ${fieldName} must be at most ${maxLength} characters`,
			fieldName,
		);
	}
	return value;
}

export function validateNumber(value, fieldName, min = -Infinity, max = Infinity) {
	const num = typeof value === 'string' ? parseFloat(value) : value;
	if (typeof num !== 'number' || isNaN(num)) {
		throw new ValidationError(`Parameter ${fieldName} must be a number`, fieldName);
	}
	if (num < min) {
		throw new ValidationError(`Parameter ${fieldName} must be at least ${min}`, fieldName);
	}
	if (num > max) {
		throw new ValidationError(`Parameter ${fieldName} must be at most ${max}`, fieldName);
	}
	return num;
}

export function validateArray(value, fieldName, minLength = 0, maxLength = Infinity) {
	if (!Array.isArray(value)) {
		throw new ValidationError(`Parameter ${fieldName} must be an array`, fieldName);
	}
	if (value.length < minLength) {
		throw new ValidationError(
			`Parameter ${fieldName} must have at least ${minLength} items`,
			fieldName,
		);
	}
	if (value.length > maxLength) {
		throw new ValidationError(
			`Parameter ${fieldName} must have at most ${maxLength} items`,
			fieldName,
		);
	}
	return value;
}

export function validateEnum(value, fieldName, allowedValues) {
	if (!allowedValues.includes(value)) {
		throw new ValidationError(
			`Parameter ${fieldName} must be one of: ${allowedValues.join(', ')}`,
			fieldName,
		);
	}
	return value;
}

export function validateFile(file, fieldName = 'file') {
	if (!file) {
		throw new ValidationError(`Missing required file parameter: ${fieldName}`, fieldName);
	}
	if (!(file instanceof File)) {
		throw new ValidationError(`Parameter ${fieldName} must be a file`, fieldName);
	}
	if (file.size === 0) {
		throw new ValidationError(`File ${fieldName} cannot be empty`, fieldName);
	}
	return file;
}

export function validateAudioFile(file, fieldName = 'file', maxSize = 25 * 1024 * 1024) {
	validateFile(file, fieldName);

	if (file.size > maxSize) {
		throw new ValidationError(
			`File ${fieldName} must be smaller than ${Math.round(maxSize / 1024 / 1024)}MB`,
			fieldName,
		);
	}

	// Check file type if available
	if (file.type && !file.type.startsWith('audio/')) {
		const supportedTypes = [
			'audio/mpeg',
			'audio/mp4',
			'audio/wav',
			'audio/webm',
			'audio/ogg',
			'audio/flac',
			'audio/x-wav',
		];

		if (!supportedTypes.includes(file.type)) {
			throw new ValidationError(
				`File ${fieldName} must be an audio file. Supported formats: ${supportedTypes.join(', ')}`,
				fieldName,
			);
		}
	}

	return file;
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
	const match = /\b([35]\d{3}):/.exec(error?.message ?? '');
	const status = match ? WORKERS_AI_ERROR_STATUS[match[1]] : undefined;
	if (!status) return error;
	const message = error.message;
	if (status === 400) return new ValidationError(message);
	if (status === 403) return new PermissionError(message);
	if (status === 404) return new NotFoundError(message);
	if (status === 429) return new RateLimitError(message);
	return new APIError(message, 'invalid_request_error', status, match[1]);
}

const REDACTED_HEADERS = new Set(['authorization', 'cookie', 'cf-access-jwt-assertion']);

function redactHeaders(headers) {
	const out = {};
	for (const [key, value] of headers.entries()) {
		out[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value;
	}
	return out;
}

// Enhanced error logging
export function logError(error, context = {}) {
	const logData = {
		timestamp: new Date().toISOString(),
		error: {
			name: error.name,
			message: error.message,
			stack: error.stack,
		},
		context,
	};

	if (error instanceof APIError) {
		logData.error.type = error.type;
		logData.error.status = error.status;
		logData.error.code = error.code;
		logData.error.param = error.param;
	}

	console.error('API Error:', JSON.stringify(logData, null, 2));
}

// Async error wrapper
export function asyncErrorHandler(handler) {
	return async (request, env, ctx) => {
		try {
			return await handler(request, env, ctx);
		} catch (error) {
			// Convert JSON parse errors to 400 validation errors
			if (error instanceof SyntaxError && error.message.includes('JSON')) {
				const parseError = new ValidationError(
					'Invalid JSON in request body: ' + error.message,
				);
				logError(parseError, {
					url: request.url,
					method: request.method,
				});
				return createErrorResponse(parseError);
			}
			const mapped = mapUpstreamError(error);
			logError(mapped, {
				url: request.url,
				method: request.method,
				headers: redactHeaders(request.headers),
			});
			return createErrorResponse(mapped);
		}
	};
}
