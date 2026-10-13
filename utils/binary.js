// Binary helpers shared by the media routes. Base64 *encoding* lives in format.js
// (arrayBufferToBase64); this module holds the decoding/hex counterparts.

/**
 * Decode a base64 string into bytes.
 * Uses the native Uint8Array.fromBase64 when the runtime provides it (no per-byte JS loop).
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToBytes(base64) {
	if (typeof Uint8Array.fromBase64 === 'function') {
		return Uint8Array.fromBase64(base64);
	}
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string} lowercase hex
 */
export function bytesToHex(buffer) {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let hex = '';
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, '0');
	}
	return hex;
}

/**
 * @param {string} hex
 * @returns {Uint8Array|null} null when the string is not an even-length hex string
 */
export function hexToBytes(hex) {
	if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
		return null;
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/**
 * SHA-256 digest of a string as lowercase hex.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256Hex(text) {
	return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
