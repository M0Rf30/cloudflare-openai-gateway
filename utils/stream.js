// Helper function for streaming models (if needed)
export async function streamToBuffer(stream) {
	const reader = stream.getReader();
	const chunks = [];

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	// Calculate total length
	const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);

	// Combine all chunks
	const buffer = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		buffer.set(chunk, offset);
		offset += chunk.length;
	}

	return buffer;
}

/**
 * Create a TransformStream for chat completion SSE streaming.
 * Handles think-tag stripping, SSE line parsing, and OpenAI-format chunk emission.
 * @param {string} uuid - The request UUID for the response id field
 * @param {number} created - The epoch-seconds creation timestamp
 * @param {string} model - The model name to include in chunks
 * @returns {TransformStream}
 */
export function createChatStreamTransformer(uuid, created, model) {
	let buffer = '';
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let isFinished = false;
	let pastThinkTag = false;
	const thinkTagEnd = '</think>';

	return new TransformStream({
		transform(chunk, controller) {
			if (isFinished) return;

			buffer += decoder.decode(chunk);

			if (!pastThinkTag) {
				const thinkIndex = buffer.indexOf(thinkTagEnd);
				if (thinkIndex !== -1) {
					buffer = buffer.substring(thinkIndex + thinkTagEnd.length);
					pastThinkTag = true;
				} else {
					return;
				}
			}

			while (true) {
				const newlineIndex = buffer.indexOf('\n');
				if (newlineIndex === -1) break;

				const line = buffer.slice(0, newlineIndex + 1);
				buffer = buffer.slice(newlineIndex + 1);

				try {
					if (line.startsWith('data: ')) {
						const content = line.slice('data: '.length);
						if (content.trim() === '[DONE]') {
							const finalChunk = 'data: ' + JSON.stringify({
								id: uuid,
								created,
								object: 'chat.completion.chunk',
								model,
								choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
							}) + '\n\n';
							controller.enqueue(encoder.encode(finalChunk));
							controller.enqueue(encoder.encode('data: [DONE]\n\n'));
							isFinished = true;
							return;
						}

						const data = JSON.parse(content);
						if (data.response) {
							const actualContent = typeof data.response === 'string'
								? data.response
								: data.response?.text || data.response?.content || JSON.stringify(data.response);

							const newChunk = 'data: ' + JSON.stringify({
								id: uuid,
								created,
								object: 'chat.completion.chunk',
								model,
								choices: [{
									delta: { role: 'assistant', content: actualContent },
									index: 0,
									finish_reason: null,
								}],
							}) + '\n\n';
							controller.enqueue(encoder.encode(newChunk));
						}
					}
				} catch (err) {
					console.error('Error parsing streaming line:', err);
				}
			}
		},

		flush(controller) {
			if (!isFinished) {
				const finalChunk = 'data: ' + JSON.stringify({
					id: uuid,
					created,
					object: 'chat.completion.chunk',
					model,
					choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
				}) + '\n\n';
				controller.enqueue(encoder.encode(finalChunk));
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			}
		},
	});
}

/**
 * Create a TransformStream for text completion SSE streaming.
 * Handles think-tag stripping, SSE line parsing, and OpenAI completion-format chunk emission.
 * @param {string} uuid - The request UUID for the response id field
 * @param {number} created - The epoch-seconds creation timestamp
 * @param {string} model - The model name to include in chunks
 * @returns {TransformStream}
 */
export function createCompletionStreamTransformer(uuid, created, model) {
	let buffer = '';
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let pastThinkTag = false;
	const thinkTagEnd = '</think>';

	return new TransformStream({
		transform(chunk, controller) {
			buffer += decoder.decode(chunk);

			if (!pastThinkTag) {
				const thinkIndex = buffer.indexOf(thinkTagEnd);
				if (thinkIndex !== -1) {
					buffer = buffer.substring(thinkIndex + thinkTagEnd.length);
					pastThinkTag = true;
				} else {
					return;
				}
			}

			while (true) {
				const newlineIndex = buffer.indexOf('\n');
				if (newlineIndex === -1) break;

				const line = buffer.slice(0, newlineIndex + 1);
				buffer = buffer.slice(newlineIndex + 1);

				try {
					if (line.startsWith('data: ')) {
						const content = line.slice('data: '.length);
						if (content.trim() === '[DONE]') {
							controller.enqueue(encoder.encode('data: [DONE]\n\n'));
							return;
						}

						const data = JSON.parse(content);
						const newChunk = 'data: ' + JSON.stringify({
							id: uuid,
							created,
							object: 'text_completion',
							model,
							choices: [{
								text: data.response,
								index: 0,
								logprobs: null,
								finish_reason: null,
							}],
						}) + '\n\n';
						controller.enqueue(encoder.encode(newChunk));
					}
				} catch (err) {
					console.error('Error parsing line:', err);
				}
			}
		},
	});
}
