export function uint8ArrayToBase64(uint8Array) {
	let string = '';

	// Convert each byte in the Uint8Array to a character
	uint8Array.forEach(byte => {
		string += String.fromCharCode(byte);
	});

	// Convert the binary string to Base64
	return btoa(string);
}

/**
 * Convert image URL to data URL
 * Fetches an external image and converts it to a base64 data URL for use with AI models
 * @param {string} imageUrl - The URL of the image to convert
 * @returns {Promise<string>} Data URL with base64 encoded image
 * @throws {Error} If URL is invalid or fetch fails
 */
export async function convertImageToDataURL(imageUrl) {
	try {
		// Validate the URL before fetching
		new URL(imageUrl);

		const response = await fetch(imageUrl);
		if (!response.ok) {
			console.error(`Failed to fetch image URL: ${response.status} ${response.statusText}`);
			throw new Error(`Failed to fetch image URL: ${response.statusText}`);
		}

		// Get content type and convert to base64
		const contentType = response.headers.get('content-type') || 'image/jpeg';
		const buffer = await response.arrayBuffer();
		let binary = '';
		const bytes = new Uint8Array(buffer);
		const len = bytes.byteLength;
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		const base64 = btoa(binary);
		const dataUrl = `data:${contentType};base64,${base64}`;
		return dataUrl;
	} catch (error) {
		console.error('Error in convertImageToDataURL:', error);
		throw new Error('Image URL must be a data URI or a valid HTTP/HTTPS URL.', { cause: error });
	}
}
