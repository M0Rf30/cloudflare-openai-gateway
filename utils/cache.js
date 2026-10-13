/**
 * Generate a cache key from request parameters
 * @param {string} model - The model name
 * @param {Array} messages - The conversation messages
 * @param {Object} params - Additional parameters (temperature, max_tokens, etc.)
 * @returns {string} Cache key
 */
export async function generateCacheKey(model, messages, params = {}) {
	const cacheData = {
		model,
		messages,
		temperature: params.temperature ?? 0.7,
		max_tokens: params.max_tokens ?? 4096,
		top_p: params.top_p ?? 0.9,
		stop: params.stop ?? null,
		seed: params.seed ?? null,
		frequency_penalty: params.frequency_penalty ?? null,
		presence_penalty: params.presence_penalty ?? null,
		response_format: params.response_format ?? null,
		tools: params.tools ?? null,
	};

	const encoder = new TextEncoder();
	const data = encoder.encode(JSON.stringify(cacheData));
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	return `chat:${hashHex}`;
}

/**
 * Cache a chat response with TTL
 * @param {KVNamespace} kv - The KV namespace
 * @param {string} cacheKey - The cache key
 * @param {Object} response - The response to cache
 * @param {number} ttlSeconds - TTL in seconds (default: 1 hour)
 */
export async function cacheResponse(kv, cacheKey, response, ttlSeconds = 3600) {
	try {
		const cacheData = {
			response,
			cached_at: Date.now(),
		};

		await kv.put(cacheKey, JSON.stringify(cacheData), {
			expirationTtl: ttlSeconds,
		});
	} catch (error) {
		console.error('Failed to cache response:', error);
	}
}

/**
 * Retrieve a cached response
 * @param {KVNamespace} kv - The KV namespace
 * @param {string} cacheKey - The cache key
 * @returns {Object|null} Cached response or null if not found/expired
 */
export async function getCachedResponse(kv, cacheKey) {
	try {
		const cached = await kv.get(cacheKey);
		if (!cached) {
			return null;
		}

		const cacheData = JSON.parse(cached);
		return cacheData.response;
	} catch (error) {
		console.error('Failed to retrieve cached response:', error);
		return null;
	}
}

/**
 * Check if caching should be enabled for this request
 * @param {Object} params - Request parameters
 * @returns {boolean} Whether to use caching
 */
export function shouldCache(params) {
	// Don't cache streaming responses
	if (params.stream) {
		return false;
	}

	// Don't cache responses with high randomness
	if (params.temperature > 1.0) {
		return false;
	}

	// Don't cache very short conversations (likely not reusable)
	if (params.messages && params.messages.length < 2) {
		return false;
	}

	return true;
}
