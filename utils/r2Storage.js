/**
 * R2 file storage utilities (used for the TTS clip cache)
 */

/**
 * Store a file in R2 bucket
 * @param {R2Bucket} bucket - R2 bucket binding
 * @param {string} key - File key/path
 * @param {ArrayBuffer|Uint8Array|ReadableStream|string} data - File data
 * @param {Object} metadata - { contentType, cacheControl, custom }
 * @returns {Promise<Object>} Upload result
 */
export async function storeFile(bucket, key, data, metadata = {}) {
	try {
		const result = await bucket.put(key, data, {
			httpMetadata: {
				contentType: metadata.contentType || 'application/octet-stream',
				cacheControl: metadata.cacheControl || 'public, max-age=31536000',
			},
			customMetadata: {
				uploadedAt: new Date().toISOString(),
				...metadata.custom,
			},
		});

		return {
			success: true,
			key,
			etag: result.etag,
			size: result.size,
			uploaded: result.uploaded,
		};
	} catch (error) {
		throw new Error(`R2 storage failed: ${error.message}`, { cause: error });
	}
}

/**
 * Retrieve a file from R2 bucket
 * @param {R2Bucket} bucket - R2 bucket binding
 * @param {string} key - File key/path
 * @returns {Promise<R2ObjectBody|null>} File object or null if not found
 */
export async function getFile(bucket, key) {
	try {
		return (await bucket.get(key)) ?? null;
	} catch (error) {
		throw new Error(`R2 retrieval failed: ${error.message}`, { cause: error });
	}
}

/**
 * Build a response for an R2 object with its stored metadata and a properly quoted ETag.
 * Answers conditional GET/HEAD requests with 304.
 * @param {R2ObjectBody} object - R2 object
 * @param {Request} request - Original request (for If-None-Match)
 * @returns {Response}
 */
export function createCachedResponse(object, request) {
	const etag = object.httpEtag;
	const conditional = request.method === 'GET' || request.method === 'HEAD';
	if (conditional && etag && request.headers.get('If-None-Match') === etag) {
		return new Response(null, { status: 304, headers: { ETag: etag } });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('ETag', etag);
	return new Response(object.body, { headers });
}
