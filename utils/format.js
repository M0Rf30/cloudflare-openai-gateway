// Response formatting utilities for OpenAI-compatible API
import { generateId } from './ids.js';

// Utility function to convert ArrayBuffer to base64 string
export function arrayBufferToBase64(buffer) {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

// Utility function to extract language ID from LLM response
export function getLanguageId(text) {
	if (!text) return 'english';

	text = text.toLowerCase().trim();
	if (text.includes('\n')) {
		return text.split('\n')[0];
	} else if (text.includes(' ')) {
		return text.split(' ')[0];
	} else {
		return text;
	}
}

// Helper function to create segments from words
export function createSegmentsFromWords(words) {
	if (!words || words.length === 0) return [];

	const segments = [];
	let currentSegment = {
		id: 0,
		start: words[0].start,
		end: words[0].end,
		text: '',
	};

	words.forEach((wordData, index) => {
		currentSegment.text += (currentSegment.text ? ' ' : '') + wordData.word;
		currentSegment.end = wordData.end;

		// Create new segment on sentence end or every 10 words
		if (
			wordData.word.endsWith('.') ||
			wordData.word.endsWith('!') ||
			wordData.word.endsWith('?') ||
			index % 10 === 9 ||
			index === words.length - 1
		) {
			segments.push({ ...currentSegment });
			if (index < words.length - 1) {
				currentSegment = {
					id: segments.length,
					start: words[index + 1].start,
					end: words[index + 1].end,
					text: '',
				};
			}
		}
	});

	return segments;
}

// Utility functions for time formatting
export function formatSRTTime(seconds) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	const ms = Math.floor((seconds % 1) * 1000);

	return `${hours.toString().padStart(2, '0')}:${minutes
		.toString()
		.padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export function formatVTTTime(seconds) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	const ms = Math.floor((seconds % 1) * 1000);

	return `${hours.toString().padStart(2, '0')}:${minutes
		.toString()
		.padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

// OpenAI-compatible response formatters
export function formatChatCompletion(response, model, stream = false) {
	const timestamp = Math.floor(Date.now() / 1000);
	const id = `chatcmpl-${generateId()}`;

	if (stream) {
		return {
			id,
			object: 'chat.completion.chunk',
			created: timestamp,
			model,
			choices: [
				{
					index: 0,
					delta: {
						role: 'assistant',
						content: response.response || '',
					},
					finish_reason: null,
				},
			],
		};
	}

	return {
		id,
		object: 'chat.completion',
		created: timestamp,
		model,
		choices: [
			{
				index: 0,
				message: {
					role: 'assistant',
					content: response.response || '',
				},
				finish_reason: 'stop',
			},
		],
		usage: {
			prompt_tokens: estimateTokens(response.prompt || ''),
			completion_tokens: estimateTokens(response.response || ''),
			total_tokens: estimateTokens((response.prompt || '') + (response.response || '')),
		},
	};
}

export function formatCompletion(response, model, prompt) {
	const timestamp = Math.floor(Date.now() / 1000);
	const id = `cmpl-${generateId()}`;

	return {
		id,
		object: 'text_completion',
		created: timestamp,
		model,
		choices: [
			{
				text: response.response || '',
				index: 0,
				logprobs: null,
				finish_reason: 'stop',
			},
		],
		usage: {
			prompt_tokens: estimateTokens(prompt),
			completion_tokens: estimateTokens(response.response || ''),
			total_tokens: estimateTokens(prompt + (response.response || '')),
		},
	};
}

export function formatEmbedding(embeddings, model, input) {
	const data = embeddings.map((embedding, index) => ({
		object: 'embedding',
		embedding: Array.isArray(embedding) ? embedding : embedding.data || embedding,
		index,
	}));

	return {
		object: 'list',
		data,
		model,
		usage: {
			prompt_tokens: Array.isArray(input)
				? input.reduce((sum, text) => sum + estimateTokens(text), 0)
				: estimateTokens(input),
			total_tokens: Array.isArray(input)
				? input.reduce((sum, text) => sum + estimateTokens(text), 0)
				: estimateTokens(input),
		},
	};
}

export function formatTranscription(response, format, options = {}) {
	const { timestamp_granularities, words, segments } = options;

	switch (format) {
	case 'json': {
		const jsonResponse = {
			text: response.text || '',
		};

		if (timestamp_granularities === 'word' && words && words.length > 0) {
			jsonResponse.words = words;
		}

		if (timestamp_granularities === 'segment') {
			if (segments && segments.length > 0) {
				jsonResponse.segments = segments;
			} else if (words && words.length > 0) {
				jsonResponse.segments = createSegmentsFromWords(words);
			}
		}

		return jsonResponse;
	}

	case 'verbose_json':
		return {
			task: 'transcribe',
			language: response.language || options.language || 'en',
			duration: response.duration || 0,
			text: response.text || '',
			words: words || [],
			segments: segments || [],
		};

	case 'text':
		return response.text || '';

	case 'srt': {
		const srtSegments = segments && segments.length > 0 ? segments : createSegmentsFromWords(words || []);
		if (srtSegments.length > 0) {
			let srtContent = '';
			srtSegments.forEach((segment, index) => {
				const startTime = formatSRTTime(segment.start);
				const endTime = formatSRTTime(segment.end);
				srtContent += `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n\n`;
			});
			return srtContent;
		}
		return response.text || '';
	}

	case 'vtt': {
		const vttSegments = segments && segments.length > 0 ? segments : createSegmentsFromWords(words || []);
		if (vttSegments.length > 0) {
			let vttContent = 'WEBVTT\n\n';
			vttSegments.forEach(segment => {
				const startTime = formatVTTTime(segment.start);
				const endTime = formatVTTTime(segment.end);
				vttContent += `${startTime} --> ${endTime}\n${segment.text}\n\n`;
			});
			return vttContent;
		}
		return response.text || '';
	}

	default:
		return response.text || '';
	}
}

export function formatTranslation(response, format, detectedLanguage = 'unknown') {
	const translatedText = response.translated_text || response.text || '';

	switch (format) {
	case 'json':
		return {
			text: translatedText,
			language: detectedLanguage,
		};

	case 'text':
	case 'srt':
	case 'vtt':
		return translatedText;

	default:
		return {
			text: translatedText,
		};
	}
}

// Utility function to process and remove <think> tags from response
export function processThink(responseText) {
	if (typeof responseText !== 'string') {
		return responseText;
	}
	const thinkTagEnd = '</think>';
	const thinkIndex = responseText.indexOf(thinkTagEnd);
	if (thinkIndex !== -1) {
		return responseText.substring(thinkIndex + thinkTagEnd.length).trim();
	}
	return responseText;
}

// Utility function to estimate token count
export function estimateTokens(text) {
	if (!text) return 0;
	// Rough estimation: ~4 characters per token
	return Math.ceil(text.length / 4);
}

// Content type helpers
export function getContentType(format) {
	const contentTypes = {
		json: 'application/json',
		text: 'text/plain',
		srt: 'application/x-subrip',
		vtt: 'text/vtt',
		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		opus: 'audio/opus',
		aac: 'audio/aac',
		flac: 'audio/flac',
		pcm: 'audio/pcm',
	};

	return contentTypes[format] || 'application/octet-stream';
}

// CORS headers
export function getCORSHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
		'Access-Control-Max-Age': '86400',
	};
}

// Response helpers
export function createResponse(data, options = {}) {
	const { status = 200, headers = {}, contentType = 'application/json' } = options;

	const responseHeaders = {
		'Content-Type': contentType,
		...getCORSHeaders(),
		...headers,
	};

	const body = contentType === 'application/json' ? JSON.stringify(data) : data;

	return new Response(body, {
		status,
		headers: responseHeaders,
	});
}

export function createStreamResponse(readableStream) {
	return new Response(readableStream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			...getCORSHeaders(),
		},
	});
}

/**
 * Extract text content from an OSS model (gpt-oss-120b / gpt-oss-20b) response.
 * These models return responses in multiple possible formats that need normalization.
 * @param {*} aiResp - The raw response from env.AI.run()
 * @returns {string} The extracted text content
 */
export function extractOSSResponse(aiResp) {
	if (typeof aiResp === 'object' && aiResp !== null) {
		// New format: output array with message objects
		if (Array.isArray(aiResp.output)) {
			// Look for assistant message with content array
			const assistantMessage = aiResp.output.find(
				msg => msg.type === 'message' && msg.role === 'assistant',
			);

			if (assistantMessage && Array.isArray(assistantMessage.content)) {
				const textContent = assistantMessage.content
					.filter(item => item.type === 'output_text')
					.map(item => item.text)
					.join('');
				if (textContent) return textContent;
			}

			// Look for output_text type objects directly in the output array
			const outputTextItems = aiResp.output.filter(item => item.type === 'output_text');
			if (outputTextItems.length > 0) {
				const textContent = outputTextItems.map(item => item.text).join('');
				if (textContent) return textContent;
			}

			// Fallback to first message content
			const firstMessage = aiResp.output[0];
			if (firstMessage && Array.isArray(firstMessage.content)) {
				const textContent = firstMessage.content
					.filter(item => item.type === 'output_text')
					.map(item => item.text)
					.join('');
				if (textContent) return textContent;
			}

			return aiResp.text || aiResp.response || '';
		}

		// Older format: response field directly
		if ('response' in aiResp) {
			return typeof aiResp.response === 'string'
				? aiResp.response
				: aiResp.response?.text || aiResp.response?.content || JSON.stringify(aiResp.response);
		}

		// Final fallback
		return aiResp.text || aiResp.response || JSON.stringify(aiResp);
	}

	return String(aiResp || '');
}
