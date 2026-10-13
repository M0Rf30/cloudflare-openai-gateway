import { arrayBufferToBase64 } from './format.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Read a response body into a Uint8Array, aborting as soon as more than
 * `maxBytes` have been received.
 */
async function readBodyWithLimit(response, maxBytes) {
	if (!response.body) {
		const buffer = new Uint8Array(await response.arrayBuffer());
		if (buffer.length > maxBytes) throw new Error(`Image exceeds the ${maxBytes} byte limit`);
		return buffer;
	}

	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.length;
			if (total > maxBytes) {
				await reader.cancel();
				throw new Error(`Image exceeds the ${maxBytes} byte limit`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const buffer = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		buffer.set(chunk, offset);
		offset += chunk.length;
	}
	return buffer;
}

/**
 * Convert image URL to data URL
 * Fetches an external image (max 10 MB, image/* content-type only) and converts
 * it to a base64 data URL for use with AI models.
 * @param {string} imageUrl - The URL of the image to convert
 * @returns {Promise<string>} Data URL with base64 encoded image
 * @throws {Error} If URL is invalid, not an image, too large, or fetch fails
 */
export async function convertImageToDataURL(imageUrl) {
	try {
		const url = new URL(imageUrl);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			throw new Error('Only http and https image URLs are supported');
		}

		const response = await fetch(url);
		if (!response.ok) {
			console.error(`Failed to fetch image URL: ${response.status} ${response.statusText}`);
			throw new Error(`Failed to fetch image URL: ${response.statusText}`);
		}

		const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
		if (!contentType.startsWith('image/')) {
			throw new Error(`URL did not return an image (content-type: ${contentType || 'missing'})`);
		}

		const declaredLength = Number(response.headers.get('content-length'));
		if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
			throw new Error(`Image exceeds the ${MAX_IMAGE_BYTES} byte limit`);
		}

		const bytes = await readBodyWithLimit(response, MAX_IMAGE_BYTES);
		return `data:${contentType};base64,${arrayBufferToBase64(bytes)}`;
	} catch (error) {
		console.error('Error in convertImageToDataURL:', error);
		throw new Error('Image URL must be a data URI or a valid HTTP/HTTPS URL.', { cause: error });
	}
}
