import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transcriptionHandler } from '../../routes/audio.js';

describe('STT Transcription Handler (real FormData upload)', () => {
	let env;

	beforeEach(() => {
		env = { AI: { run: vi.fn() } };
	});

	it('base64-encodes the uploaded bytes for the default model', async () => {
		const form = new FormData();
		form.append('file', new Blob(['mock audio data'], { type: 'audio/wav' }), 'test.wav');
		const request = new Request('https://gateway.test/v1/audio/transcriptions', { method: 'POST', body: form });

		env.AI.run.mockResolvedValue({ text: 'Hello, this is a test of text to speech.' });

		const response = await transcriptionHandler(request, env);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.text).toBe('Hello, this is a test of text to speech.');
		expect(env.AI.run).toHaveBeenCalledTimes(1);
		expect(env.AI.run).toHaveBeenCalledWith('@cf/openai/whisper-large-v3-turbo', {
			audio: 'bW9jayBhdWRpbyBkYXRh',
		});
	});

	it('encodes multi-megabyte uploads without per-byte string concatenation limits', async () => {
		const bytes = new Uint8Array(3 * 1024 * 1024).fill(65);
		const form = new FormData();
		form.append('file', new File([bytes], 'big.wav', { type: 'audio/wav' }));
		const request = new Request('https://gateway.test/v1/audio/transcriptions', { method: 'POST', body: form });
		env.AI.run.mockResolvedValue({ text: 'ok' });

		const response = await transcriptionHandler(request, env);

		expect(response.status).toBe(200);
		const [, input] = env.AI.run.mock.calls[0];
		expect(input.audio.length).toBe(Math.ceil(bytes.length / 3) * 4);
		expect(input.audio.startsWith('QUFB')).toBe(true);
	});
});
