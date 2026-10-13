/**
 * R2 file storage utilities for handling large files
 */

/**
 * Store a file in R2 bucket
 * @param {R2Bucket} bucket - R2 bucket binding
 * @param {string} key - File key/path
 * @param {ArrayBuffer|ReadableStream|string} data - File data
 * @param {Object} metadata - File metadata
 * @returns {Promise<Object>} Upload result
 */
export async function storeFile(bucket, key, data, metadata = {}) {
	try {
		const options = {
			httpMetadata: {
				contentType: metadata.contentType || 'application/octet-stream',
				cacheControl: metadata.cacheControl || 'public, max-age=31536000',
			},
			customMetadata: {
				uploadedAt: new Date().toISOString(),
				...metadata.custom,
			},
		};

		const result = await bucket.put(key, data, options);

		return {
			success: true,
			key,
			etag: result.etag,
			size: result.size,
			uploaded: result.uploaded,
		};
	} catch (error) {
		console.error('Failed to store file in R2:', error);
		throw new Error(`R2 storage failed: ${error.message}`, { cause: error });
	}
}

/**
 * Retrieve a file from R2 bucket
 * @param {R2Bucket} bucket - R2 bucket binding
 * @param {string} key - File key/path
 * @returns {Promise<R2Object|null>} File object or null if not found
 */
export async function getFile(bucket, key) {
	try {
		const object = await bucket.get(key);
		if (!object) {
			return null;
		}

		return object;
	} catch (error) {
		console.error('Failed to retrieve file from R2:', error);
		throw new Error(`R2 retrieval failed: ${error.message}`, { cause: error });
	}
}

/**
 * Delete a file from R2 bucket
 * @param {R2Bucket} bucket - R2 bucket binding
 * @param {string} key - File key/path
 * @returns {Promise<boolean>} Whether the file was deleted
 */
export async function deleteFile(bucket, key) {
	try {
		await bucket.delete(key);
		return true;
	} catch (error) {
		console.error('Failed to delete file from R2:', error);
		return false;
	}
}

/**
 * Create a cached response for a file with proper headers
 * @param {R2Object} object - R2 object
 * @param {Request} request - Original request for conditional checks
 * @param {ExecutionContext} ctx - Execution context for caching
 * @returns {Promise<Response>} Cached response
 */
export async function createCachedResponse(object, request, ctx) {
	// Check if client has the file cached (conditional request)
	const ifNoneMatch = request.headers.get('If-None-Match');
	if (ifNoneMatch && ifNoneMatch === object.etag) {
		return new Response(null, { status: 304 });
	}

	// Prepare response headers
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.etag);
	headers.set('cache-control', 'public, max-age=31536000'); // Cache for 1 year

	// Create response
	const response = new Response(object.body, { headers });

	// Cache the response using Cache API if available
	if (ctx && typeof ctx.waitUntil === 'function') {
		const cache = caches.default;
		const cacheKey = new Request(request.url, { method: 'GET' });
		ctx.waitUntil(cache.put(cacheKey, response.clone()));
	}

	return response;
}

/**
 * Generate a unique file key based on content and metadata
 * @param {string} prefix - Key prefix (e.g., 'audio', 'images')
 * @param {ArrayBuffer} content - File content for hashing
 * @param {string} extension - File extension
 * @returns {Promise<string>} Unique file key
 */
export async function generateFileKey(prefix, content, extension) {
	// Create hash of content for deduplication
	const hash = await crypto.subtle.digest('SHA-256', content);
	const hashArray = Array.from(new Uint8Array(hash));
	const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

	const timestamp = Date.now();
	return `${prefix}/${timestamp}-${hashHex.substring(0, 16)}.${extension}`;
}

/**
 * Check if Cache API has the file cached
 * @param {Request} request - Request to check
 * @returns {Promise<Response|null>} Cached response or null
 */
export async function getCachedFile(request) {
	try {
		const cache = caches.default;
		const cached = await cache.match(request);
		if (cached) {
			return cached;
		}
		return null;
	} catch (error) {
		console.error('Cache API error:', error);
		return null;
	}
}
