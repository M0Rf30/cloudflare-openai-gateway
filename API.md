# API Reference

Complete reference for the OpenAI-compatible API endpoints.

## Base URL

```
https://your-worker.workers.dev/v1
```

## Authentication

All API requests require authentication using Bearer tokens:

```http
Authorization: Bearer your-access-token
```

## Common Headers

```http
Content-Type: application/json
Authorization: Bearer your-access-token
```

## Response Format

All responses follow OpenAI's response format with proper error handling:

### Success Response

```json
{
	"data": "...",
	"object": "...",
	"usage": {
		"prompt_tokens": 0,
		"completion_tokens": 0,
		"total_tokens": 0
	}
}
```

### Error Response

```json
{
	"error": {
		"message": "Error description",
		"type": "error_type",
		"param": "parameter_name"
	}
}
```

---

## Chat Completions

Create a chat completion response for the given conversation.

### Endpoint

```
POST /v1/chat/completions
```

### Request Body

| Field               | Type         | Required | Description                                    |
| ------------------- | ------------ | -------- | ---------------------------------------------- |
| `model`             | string       | Yes      | ID of the model to use                         |
| `messages`          | array        | Yes      | A list of messages comprising the conversation |
| `max_tokens`        | integer      | No       | Maximum number of tokens to generate           |
| `temperature`       | number       | No       | Sampling temperature (0-2)                     |
| `top_p`             | number       | No       | Nucleus sampling parameter (0-1)               |
| `n`                 | integer      | No       | Number of completions to generate (1-128)      |
| `stream`            | boolean      | No       | Whether to stream back partial progress        |
| `stop`              | string/array | No       | Stop sequences                                 |
| `presence_penalty`  | number       | No       | Presence penalty (-2 to 2)                     |
| `frequency_penalty` | number       | No       | Frequency penalty (-2 to 2)                    |
| `user`              | string       | No       | User ID for tracking                           |

### Example Request

```json
{
	"model": "gpt-3.5-turbo",
	"messages": [
		{
			"role": "system",
			"content": "You are a helpful assistant."
		},
		{
			"role": "user",
			"content": "Hello!"
		}
	],
	"max_tokens": 100,
	"temperature": 0.7
}
```

### Example Response

```json
{
	"id": "chatcmpl-abc123",
	"object": "chat.completion",
	"created": 1677652288,
	"model": "gpt-3.5-turbo",
	"choices": [
		{
			"index": 0,
			"message": {
				"role": "assistant",
				"content": "Hello! How can I help you today?"
			},
			"finish_reason": "stop"
		}
	],
	"usage": {
		"prompt_tokens": 20,
		"completion_tokens": 10,
		"total_tokens": 30
	}
}
```

### Supported Models

- `gpt-3.5-turbo` → `@cf/meta/llama-3.1-8b-instruct-fp8` (8K context)
- `gpt-3.5-turbo-16k` → `@cf/qwen/qwq-32b` (32K context, reasoning)
- `gpt-4` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (128K context)
- `gpt-4-turbo` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (128K context)
- `gpt-4o` → `@cf/meta/llama-3.2-11b-vision-instruct` (128K context, vision)
- `gpt-4o-mini` → `@cf/meta/llama-3.2-3b-instruct` (128K context)
- `gpt-4-32k` → `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` (32K context, reasoning)

---

## Decisions (System One API)

Evaluate a `state` against typed questions with Cloudflare's Clef decision models. The body and response follow the [Workers AI Clef schema](https://developers.cloudflare.com/workers-ai/models/clef/) and are passed through unchanged. Clef models are rejected by `/v1/chat/completions` and `/v1/completions` with a 400.

### Endpoint

```
POST /v1/systemone
```

### Request Body

| Field       | Type          | Required | Description                                                                                  |
| ----------- | ------------- | -------- | -------------------------------------------------------------------------------------------- |
| `model`     | string        | No       | `clef` (default), `clef-flash`, `clef-omni`, or the full `@cf/cloudflare/...` path            |
| `state`     | string/object | Yes      | Content to evaluate (text, records, chat logs, application state)                            |
| `questions` | object        | Yes      | 1–64 questions keyed by id; each `{ type: "noul" \| "choice" \| "score", instructions, criteria? }` |
| `images`    | array         | No       | Up to 4 embedded images; `clef-omni` also accepts `audio` and `videos`                        |

### Example Request

```json
{
	"model": "clef-flash",
	"state": "Checkout has been failing for every customer for the last hour.",
	"questions": {
		"urgent": { "type": "noul", "instructions": "Is this support request urgent?" },
		"team": {
			"type": "choice",
			"instructions": "Which team should handle this request?",
			"criteria": { "billing": "Payments", "technical": "Outages and errors", "sales": "Plans" }
		}
	}
}
```

---

## Completions (Legacy)

Create a completion for the given prompt.

### Endpoint

```
POST /v1/completions
```

### Request Body

| Field               | Type         | Required | Description                               |
| ------------------- | ------------ | -------- | ----------------------------------------- |
| `model`             | string       | Yes      | ID of the model to use                    |
| `prompt`            | string/array | Yes      | The prompt(s) to generate completions for |
| `max_tokens`        | integer      | No       | Maximum number of tokens to generate      |
| `temperature`       | number       | No       | Sampling temperature (0-2)                |
| `top_p`             | number       | No       | Nucleus sampling parameter (0-1)          |
| `n`                 | integer      | No       | Number of completions to generate         |
| `stream`            | boolean      | No       | Whether to stream back partial progress   |
| `logprobs`          | integer      | No       | Include log probabilities (0-5)           |
| `echo`              | boolean      | No       | Echo back the prompt                      |
| `stop`              | string/array | No       | Stop sequences                            |
| `presence_penalty`  | number       | No       | Presence penalty (-2 to 2)                |
| `frequency_penalty` | number       | No       | Frequency penalty (-2 to 2)               |
| `best_of`           | integer      | No       | Generate best_of completions server-side  |
| `suffix`            | string       | No       | Suffix for completion                     |
| `user`              | string       | No       | User ID for tracking                      |

### Example Request

```json
{
	"model": "gpt-3.5-turbo-instruct",
	"prompt": "Once upon a time",
	"max_tokens": 50,
	"temperature": 0.7
}
```

---

## Embeddings

Create an embedding vector representing the input text.

### Endpoint

```
POST /v1/embeddings
```

### Request Body

| Field             | Type         | Required | Description                                          |
| ----------------- | ------------ | -------- | ---------------------------------------------------- |
| `input`           | string/array | Yes      | Input text to embed                                  |
| `model`           | string       | No       | ID of the model to use                               |
| `encoding_format` | string       | No       | Format to return embeddings in ("float" or "base64") |
| `dimensions`      | integer      | No       | Number of dimensions for the embedding               |
| `user`            | string       | No       | User ID for tracking                                 |

### Example Request

```json
{
	"input": "The quick brown fox jumps over the lazy dog",
	"model": "text-embedding-ada-002"
}
```

### Example Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0023064255, -0.009327292, ...]
    }
  ],
  "model": "text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

### Supported Models

- `text-embedding-ada-002` → `@cf/baai/bge-base-en-v1.5` (512 tokens input)
- `text-embedding-3-small` → `@cf/baai/bge-small-en-v1.5` (512 tokens input)
- `text-embedding-3-large` → `@cf/baai/bge-large-en-v1.5` (512 tokens input)

---

## Audio Transcriptions

Transcribe audio into the input language.

### Endpoint

```
POST /v1/audio/transcriptions
```

### Request Body (multipart/form-data)

| Field                     | Type   | Required | Description                              |
| ------------------------- | ------ | -------- | ---------------------------------------- |
| `file`                    | file   | Yes      | Audio file to transcribe                 |
| `model`                   | string | Yes      | ID of the model to use                   |
| `prompt`                  | string | No       | Optional text to guide the model's style |
| `response_format`         | string | No       | Format of transcript output              |
| `temperature`             | number | No       | Sampling temperature (0-1)               |
| `language`                | string | No       | Language of the input audio              |
| `timestamp_granularities` | string | No       | "segment" or "word"                      |

### Response Formats

- `json` (default): JSON with text
- `text`: Plain text
- `srt`: SubRip subtitle format
- `verbose_json`: JSON with metadata
- `vtt`: WebVTT subtitle format

### Example Request (cURL)

```bash
curl -X POST "https://your-worker.workers.dev/v1/audio/transcriptions" \
  -H "Authorization: Bearer your-token" \
  -F "file=@audio.mp3" \
  -F "model=whisper-1" \
  -F "response_format=json"
```

### Example Response

```json
{
	"text": "Hello, my name is John and I am speaking into this microphone."
}
```

### Verbose JSON Response

```json
{
	"task": "transcribe",
	"language": "english",
	"duration": 2.45,
	"text": "Hello, my name is John.",
	"words": [
		{
			"word": "Hello,",
			"start": 0.0,
			"end": 0.5
		}
	],
	"segments": [
		{
			"id": 0,
			"start": 0.0,
			"end": 2.45,
			"text": "Hello, my name is John."
		}
	]
}
```

### Supported Models

- `whisper-1` → `@cf/openai/whisper-large-v3-turbo` (30 seconds audio)
- `whisper` → `@cf/openai/whisper-large-v3-turbo` (30 seconds audio)
- `whisper-tiny-en` → `@cf/openai/whisper-tiny-en` (30 seconds audio)
- `whisper-large-v3-turbo` → `@cf/openai/whisper-large-v3-turbo` (30 seconds audio)

---

## Audio Translations

Translate audio into English.

### Endpoint

```
POST /v1/audio/translations
```

### Request Body (multipart/form-data)

| Field             | Type   | Required | Description                        |
| ----------------- | ------ | -------- | ---------------------------------- |
| `file`            | file   | Yes      | Audio file to translate            |
| `model`           | string | Yes      | ID of the model to use             |
| `prompt`          | string | No       | Optional text to guide translation |
| `response_format` | string | No       | Format of transcript output        |
| `temperature`     | number | No       | Sampling temperature (0-1)         |

### Example Request (cURL)

```bash
curl -X POST "https://your-worker.workers.dev/v1/audio/translations" \
  -H "Authorization: Bearer your-token" \
  -F "file=@spanish_audio.mp3" \
  -F "model=whisper-1"
```

### Example Response

```json
{
	"text": "Hello, my name is John and I speak Spanish.",
	"language": "spanish"
}
```

---

## Text-to-Speech

Generate audio from text.

### Endpoint

```
POST /v1/audio/speech
```

### Request Body

| Field             | Type   | Required | Description                                   |
| ----------------- | ------ | -------- | --------------------------------------------- |
| `model`           | string | Yes      | TTS model to use                              |
| `input`           | string | Yes      | Text to generate audio for                    |
| `voice`           | string | Yes      | Voice to use for generation                   |
| `response_format` | string | No       | Audio format (mp3, opus, aac, flac, wav, pcm) |
| `speed`           | number | No       | Speed of speech (0.25-4.0)                    |

### Example Request

```json
{
	"model": "tts-1",
	"input": "Hello, this is a test of the text to speech system.",
	"voice": "alloy",
	"response_format": "mp3"
}
```

### Response

Returns audio data in the specified format.

### Supported Voices

- `alloy` - Standard voice
- `echo` - Alternative voice
- `fable` - Alternative voice
- `onyx` - Alternative voice
- `nova` - Alternative voice
- `shimmer` - Alternative voice

### Supported Models

- `tts-1` → `@cf/myshell-ai/melotts` (4K characters input)
- `tts-1-hd` → `@cf/myshell-ai/melotts` (4K characters input)

---

## Models

List available models.

### Endpoint

```
GET /v1/models
```

### Example Response

```json
{
	"object": "list",
	"data": [
		{
			"id": "@cf/meta/llama-2-7b-chat-int8",
			"object": "model",
			"created": 1677610602,
			"owned_by": "cloudflare",
			"capabilities": ["chat", "completion"]
		},
		{
			"id": "@cf/openai/whisper",
			"object": "model",
			"created": 1677610602,
			"owned_by": "cloudflare",
			"capabilities": ["transcription", "translation"]
		}
	]
}
```

---

## Image Generation

Generate images from text prompts.

### Endpoint

```
POST /v1/images/generations
```

### Request Body

| Field             | Type    | Required | Description                              |
| ----------------- | ------- | -------- | ---------------------------------------- |
| `prompt`          | string  | Yes      | Text description of desired image        |
| `model`           | string  | No       | Model to use for generation              |
| `n`               | integer | No       | Number of images to generate (1-10)      |
| `size`            | string  | No       | Size of generated images                 |
| `response_format` | string  | No       | Format of response ("url" or "b64_json") |
| `user`            | string  | No       | User ID for tracking                     |

### Example Request

```json
{
	"prompt": "A cute baby sea otter",
	"n": 1,
	"size": "1024x1024"
}
```

---

## Error Codes

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request - Invalid parameters
- `401` - Unauthorized - Invalid or missing API key
- `403` - Forbidden - Insufficient permissions
- `404` - Not Found - Endpoint not found
- `429` - Too Many Requests - Rate limit exceeded
- `500` - Internal Server Error - Server error

### Error Types

- `invalid_request_error` - Invalid request parameters
- `authentication_error` - Authentication failed
- `permission_error` - Permission denied
- `not_found_error` - Resource not found
- `rate_limit_exceeded` - Too many requests
- `server_error` - Internal server error

---

## Rate Limits

Rate limits are enforced to ensure fair usage:

- **Default**: 1000 requests per hour per API key
- **Burst**: Up to 10 requests per second
- **File Upload**: Maximum 25MB per file

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1677652288
```

---

## Content Types

### Supported Audio Formats

- MP3 (`audio/mpeg`)
- MP4 (`audio/mp4`)
- WAV (`audio/wav`)
- WebM (`audio/webm`)
- OGG (`audio/ogg`)
- FLAC (`audio/flac`)

### Response Content Types

- JSON: `application/json`
- Plain Text: `text/plain`
- Audio: `audio/mpeg`, `audio/wav`, etc.
- Subtitles: `application/x-subrip`, `text/vtt`

---

## CORS Support

The API includes full CORS support with the following headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
Access-Control-Max-Age: 86400
```

---

## Streaming Support

Chat completions and completions support streaming responses using Server-Sent Events (SSE):

### Request

```json
{
  "model": "gpt-3.5-turbo",
  "messages": [...],
  "stream": true
}
```

### Response Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### Response Format

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk",...}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk",...}

data: [DONE]
```
