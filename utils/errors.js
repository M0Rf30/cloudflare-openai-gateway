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
			logError(error, {
				url: request.url,
				method: request.method,
				headers: Object.fromEntries(request.headers.entries()),
			});
			return createErrorResponse(error);
		}
	};
}
