# API Reference

Complete reference for the OpenAI-compatible API endpoints.

## Base URL

```
https://your-worker.workers.dev/v1
```

## Authentication

All API requests require a Bearer token (the `Bearer` scheme is matched case-insensitively):

```http
Authorization: Bearer your-access-token
```

A missing or malformed header, or a wrong token, returns `401` with `type: "authentication_error"`. If the server has no `ACCESS_TOKEN` configured, every request is rejected. The only exception is `GET /v1/images/get/:name`, which is authorised by an HMAC-signed, expiring URL (see [Image Generation](#image-generation)).

## Common Headers

```http
Content-Type: application/json
Authorization: Bearer your-access-token
```

Audio transcription/translation requests use `multipart/form-data` instead.

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

| Field                   | Type          | Required | Description                                                                                      |
| ----------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `model`                 | string        | No       | OpenAI alias or `@cf/...` model ID. Defaults to `@cf/openai/gpt-oss-120b`                        |
| `messages`              | array         | Yes      | A non-empty list of messages (text, or content parts with `image_url`, `role: "tool"` results)   |
| `max_tokens`            | integer       | No       | Maximum tokens to generate (capped at the model's context window)                                |
| `max_completion_tokens` | integer       | No       | Alias of `max_tokens`; takes precedence when both are sent                                       |
| `temperature`           | number        | No       | Sampling temperature, clamped to 0-2 (default 0.7). `0` is honored                               |
| `top_p`                 | number        | No       | Nucleus sampling, clamped to 0.001-1 (default 0.9)                                               |
| `n`                     | integer       | No       | Only `1` is supported; any other value returns 400                                               |
| `stream`                | boolean       | No       | Stream the response as Server-Sent Events                                                        |
| `stream_options`        | object        | No       | `{ "include_usage": true }` adds a final usage chunk to the stream                               |
| `stop`                  | string/array  | No       | Up to 4 non-empty stop sequences, enforced by the gateway (also while streaming)                 |
| `seed`                  | integer       | No       | Forwarded to the model; values outside 1-9999999999 are mapped deterministically into that range |
| `presence_penalty`      | number        | No       | Presence penalty (-2 to 2), forwarded                                                            |
| `frequency_penalty`     | number        | No       | Frequency penalty (-2 to 2), forwarded                                                           |
| `response_format`       | object        | No       | `{ "type": "text" \| "json_object" \| "json_schema", ... }`; other types return 400              |
| `tools`                 | array         | No       | Function tools (`type: "function"`); see [Tool calling](#tool-calling)                           |
| `tool_choice`           | string/object | No       | `"none"` disables tools; `{type:"function",function:{name}}` restricts to one tool               |
| `functions`             | array         | No       | Legacy function-calling spelling (converted to `tools`)                                          |

Other OpenAI fields (`user`, `logprobs`, ...) are accepted and ignored.

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
	"id": "chatcmpl-0f8e5c1d7a3b4c2e9d6a1b8f3c7e4a20",
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

- `id` is `chatcmpl-` followed by 32 hex characters (`cmpl-` for `/v1/completions`).
- `model` echoes the name sent by the client.
- `usage` is the model's own usage when it reports one; otherwise it is estimated (about 4 characters per token).
- `finish_reason` is `stop`, `length` (the token limit was reached) or `tool_calls`.
- `<think>…</think>` reasoning blocks emitted by reasoning models are stripped from the content.

### Tool calling

Models with the `function-calling` capability (see `GET /v1/models` / `utils/models.js`) receive the `tools` natively and their calls are returned as OpenAI `tool_calls` with `finish_reason: "tool_calls"`. All other models use a prompt-injection fallback that asks the model to answer with a JSON function call, which is parsed into the same response shape. `role: "tool"` messages and assistant `tool_calls` in the history are converted for either path. With the fallback, a `stream: true` request runs non-streaming upstream and the result is replayed as SSE. `tool_choice: "required"` cannot be enforced.

### Multimodal input

`image_url` content parts accept data URLs or remote `http(s)` URLs. Remote images are fetched once, must have an `image/*` content type and be at most 10 MB, otherwise the request fails with 400.

### Supported Models

Any chat model of the catalog (`GET /v1/models`), by `@cf/...` ID, plus these aliases:

- `gpt-3.5-turbo` → `@cf/meta/llama-3.1-8b-instruct-fp8`
- `gpt-3.5-turbo-16k` → `@cf/qwen/qwq-32b` (reasoning)
- `gpt-4` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- `gpt-4-turbo` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- `gpt-4o` → `@cf/meta/llama-3.2-11b-vision-instruct` (vision)
- `gpt-4o-mini` → `@cf/meta/llama-3.2-3b-instruct`
- `gpt-4-32k` → `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` (reasoning)

Alias rule: an alias only resolves on endpoints whose category contains its target. `text-embedding-*` on chat, or `text-moderation-*` (→ `llama-guard-3-8b`, not a chat model) on chat, returns 400. Clef decision models return 400 and point to `/v1/systemone`.

---

## Decisions (System One API)

Evaluate a `state` against typed questions with Cloudflare's Clef decision models. The body and response follow the [Workers AI Clef schema](https://developers.cloudflare.com/workers-ai/models/clef/) and are passed through unchanged. Clef models are rejected by `/v1/chat/completions` and `/v1/completions` with a 400.

### Endpoint

```
POST /v1/systemone
```

### Request Body

| Field       | Type          | Required | Description                                                                                         |
| ----------- | ------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `model`     | string        | No       | `clef` (default), `clef-flash`, `clef-omni`, or the full `@cf/cloudflare/...` path                  |
| `state`     | string/object | Yes      | Content to evaluate (text, records, chat logs, application state)                                   |
| `questions` | object        | Yes      | 1–64 questions keyed by id; each `{ type: "noul" \| "choice" \| "score", instructions, criteria? }` |
| `images`    | array         | No       | Up to 4 embedded images; `clef-omni` also accepts `audio` and `videos`                              |

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

| Field                   | Type         | Required | Description                                                        |
| ----------------------- | ------------ | -------- | ------------------------------------------------------------------ |
| `model`                 | string       | No       | Model to use (default `@cf/openai/gpt-oss-120b`)                   |
| `prompt`                | string       | Yes      | The prompt (arrays of prompts are not supported)                   |
| `max_tokens`            | integer      | No       | Maximum number of tokens to generate                               |
| `max_completion_tokens` | integer      | No       | Alias of `max_tokens`                                              |
| `temperature`           | number       | No       | Sampling temperature (0-2). `0` is honored                         |
| `top_p`                 | number       | No       | Nucleus sampling parameter (0.001-1)                               |
| `n`                     | integer      | No       | Only `1` is supported; other values return 400                     |
| `stream`                | boolean      | No       | Stream partial progress; `stream_options.include_usage` is honored |
| `stop`                  | string/array | No       | Up to 4 stop sequences, enforced by the gateway                    |
| `seed`                  | integer      | No       | Forwarded to the model                                             |
| `presence_penalty`      | number       | No       | Presence penalty (-2 to 2)                                         |
| `frequency_penalty`     | number       | No       | Frequency penalty (-2 to 2)                                        |
| `response_format`       | object       | No       | `text`, `json_object` or `json_schema`                             |

`logprobs`, `echo`, `best_of`, `suffix` and `user` are accepted but ignored. The response `id` is `cmpl-…`, `usage` and `finish_reason` (`stop` or `length`) behave as for chat completions.

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

| Field             | Type         | Required | Description                                                                             |
| ----------------- | ------------ | -------- | --------------------------------------------------------------------------------------- |
| `input`           | string/array | Yes      | Text or array of non-empty strings. At most 32 items for qwen3-embedding, 100 otherwise |
| `model`           | string       | No       | Model to use (default `@cf/baai/bge-base-en-v1.5`)                                      |
| `encoding_format` | string       | No       | `float` (default) or `base64` (little-endian Float32 array, base64 encoded)             |
| `dimensions`      | integer      | No       | Only accepted when equal to the model's native size; otherwise 400                      |
| `pooling`         | string       | No       | Cloudflare extension: `mean` (default) or `cls`; only used by the bge-\*-en-v1.5 models |
| `user`            | string       | No       | Ignored                                                                                 |

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

- `text-embedding-ada-002` → `@cf/baai/bge-base-en-v1.5` (768 dimensions, default)
- `text-embedding-3-small` → `@cf/baai/bge-small-en-v1.5` (384 dimensions)
- `text-embedding-3-large` → `@cf/baai/bge-large-en-v1.5` (1024 dimensions)
- Any embedding model of the catalog by `@cf/...` ID (e.g. `@cf/qwen/qwen3-embedding-0.6b`)

---

## Audio Transcriptions

Transcribe audio into the input language.

### Endpoint

```
POST /v1/audio/transcriptions
```

### Request Body (multipart/form-data)

| Field                       | Type   | Required | Description                                                                                    |
| --------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `file`                      | file   | Yes      | Audio file, at most 25 MB (413 above; 2 MiB for the legacy `whisper` models)                   |
| `model`                     | string | No       | Defaults to `@cf/openai/whisper-large-v3-turbo`                                                |
| `prompt`                    | string | No       | Sent as `initial_prompt` to whisper-large-v3-turbo                                             |
| `response_format`           | string | No       | `json` (default), `text`, `srt`, `verbose_json`, `vtt`; anything else returns 400              |
| `temperature`               | number | No       | Validated (0-1) but ignored                                                                    |
| `language`                  | string | No       | Language of the input audio                                                                    |
| `timestamp_granularities[]` | string | No       | `segment` and/or `word` (repeatable; the bare field name `timestamp_granularities` also works) |

### Response Formats

- `json` (default): `{ "text": "..." }`
- `text`: Plain text (`text/plain; charset=utf-8`)
- `srt`: SubRip subtitles (`text/plain; charset=utf-8`)
- `verbose_json`: `task`, `language`, `duration`, `text` plus `segments` (default) and `words` (only when `timestamp_granularities[]=word` is requested)
- `vtt`: WebVTT subtitles (`text/vtt; charset=utf-8`)

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

- `whisper-1`, `whisper`, `whisper-large-v3-turbo` → `@cf/openai/whisper-large-v3-turbo` (default; reports language, duration, segments and word timestamps)
- `whisper-tiny-en` → `@cf/openai/whisper-tiny-en` (English only, 2 MiB limit)
- `@cf/openai/whisper` (by full ID; 2 MiB limit, no language reported)
- `@cf/deepgram/nova-3`
- `@cf/deepgram/flux` and other models return 400.

---

## Audio Translations

Translate audio into English.

### Endpoint

```
POST /v1/audio/translations
```

### Request Body (multipart/form-data)

| Field             | Type   | Required | Description                                                              |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------ |
| `file`            | file   | Yes      | Audio file to translate (25 MB max)                                      |
| `model`           | string | No       | Defaults to `@cf/openai/whisper-large-v3-turbo`                          |
| `prompt`          | string | No       | Optional text to guide translation                                       |
| `response_format` | string | No       | Same values as transcriptions                                            |
| `temperature`     | number | No       | Validated (0-1) but ignored                                              |
| `language`        | string | No       | Required (ISO code, e.g. `es`) for the legacy `@cf/openai/whisper` model |

`whisper-large-v3-turbo` translates in a single call. The legacy `@cf/openai/whisper` model transcribes and then translates with `@cf/meta/m2m100-1.2b`, so the client must supply `language`. `whisper-tiny-en` and `nova-3` cannot translate (400).

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

| Field             | Type   | Required | Description                                                                                                        |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `model`           | string | No       | Defaults to `@cf/myshell-ai/melotts`                                                                               |
| `input`           | string | Yes      | Text to generate audio for (4096 characters max)                                                                   |
| `voice`           | string | No       | Voice (default `alloy`); must be valid for the model                                                               |
| `response_format` | string | No       | `mp3` (default). melotts supports `mp3` only; Aura models support `mp3`, `opus` (ogg), `aac`, `flac`, `wav`, `pcm` |
| `speed`           | number | No       | 0.25-4.0, but only `1` is accepted: any other value returns 400                                                    |

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

Returns audio data in the requested format (`Content-Type` matches, e.g. `audio/mpeg`, `audio/ogg`) with `Content-Disposition: attachment`.

### Supported Voices

- OpenAI names `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` work on every model. On melotts they select a language (en, fr, en, es, en, zh); on Aura models they map to a native speaker.
- Aura models also accept their native speaker names (e.g. `asteria`, `orion`, `luna` on `aura-1` / `aura-2-en`; `sirio`, `carina`, ... on `aura-2-es`).

### Supported Models

- `tts-1`, `tts-1-hd` → `@cf/myshell-ai/melotts`
- `@cf/deepgram/aura-1`, `@cf/deepgram/aura-2-en`, `@cf/deepgram/aura-2-es` (by full ID)

### Caching

When the `AUDIO_BUCKET` R2 binding exists, every generated clip is stored under a key derived from model, voice, format and input, and identical requests are served from R2 (`Cache-Control: private, max-age=86400`).

---

## Models

List available models: the OpenAI aliases (`owned_by: "openai"`) followed by the live Workers AI catalog (`owned_by: "cloudflare"` or `"huggingface"`).

### Endpoint

```
GET /v1/models
```

`created` is a Unix timestamp in seconds. The route requires the `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets and returns a 500 error if they are missing. The upstream catalog is cached for 5 minutes.

### Example Response

```json
{
	"object": "list",
	"data": [
		{
			"id": "gpt-3.5-turbo",
			"object": "model",
			"created": 1677610602,
			"owned_by": "openai"
		},
		{
			"id": "@cf/openai/gpt-oss-120b",
			"object": "model",
			"created": 1677610602,
			"owned_by": "cloudflare"
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

| Field             | Type    | Required | Description                                                                                  |
| ----------------- | ------- | -------- | -------------------------------------------------------------------------------------------- |
| `prompt`          | string  | Yes      | Text description of desired image                                                            |
| `model`           | string  | No       | Defaults to `@cf/black-forest-labs/flux-1-schnell` (`dall-e-2` / `dall-e-3` map to it)       |
| `n`               | integer | No       | Number of images, 1-4 (each image is a separate model call)                                  |
| `size`            | string  | No       | `WIDTHxHEIGHT`, range-checked per model; models with a fixed size (flux-1-schnell) ignore it |
| `response_format` | string  | No       | `url` (default) or `b64_json`; the legacy `format` field is accepted as an alias             |
| `seed`            | integer | No       | Non-negative integer, forwarded to models that take a seed                                   |
| `user`            | string  | No       | Ignored                                                                                      |

Supported models: `flux-1-schnell`, `flux-2-klein-9b`, `flux-2-klein-4b`, `flux-2-dev`, `stable-diffusion-xl-base-1.0`, `stable-diffusion-xl-lightning`, `dreamshaper-8-lcm`, `phoenix-1.0`, `lucid-origin` (all under `@cf/...`). The inpainting model is not supported (400).

### Example Request

```json
{
	"prompt": "A cute baby sea otter",
	"n": 1,
	"size": "1024x1024"
}
```

### Example Response

```json
{
	"created": 1677652288,
	"data": [
		{
			"url": "https://your-worker.workers.dev/v1/images/get/3f2c9a64-1d7b-4e5a-9c3e-0b8f7a6d5e41.png?exp=1677655888&sig=9b1f...",
			"revised_prompt": "A cute baby sea otter"
		}
	]
}
```

With `response_format: "b64_json"` each entry has `b64_json` instead of `url`. If `IMAGE_BUCKET` (R2) is not bound, `url` requests fall back to `b64_json` plus a `warning` field.

### Retrieve an Image

```
GET /v1/images/get/:name?exp=<unix>&sig=<hex>
```

URLs returned by the generation endpoint are HMAC-SHA256 signed (key derived from `ACCESS_TOKEN`) and expire after 1 hour. This route needs **no Bearer token**; the signature is the credential. Responses: `200` with the stored content type, `403` for a missing, invalid or expired signature, `404` for an unknown name, `501` if `IMAGE_BUCKET` is not bound.

---

## Retrieval-Augmented Generation (RAG)

Requires the `VECTOR_INDEX` Vectorize binding (503 otherwise). Documents are chunked, embedded and stored in a native Vectorize **namespace** (default `documents`, at most 64 bytes). The embedding model's dimensions must match the index (`VECTOR_INDEX_DIMENSIONS`, default 768); the default model is `@cf/baai/bge-base-en-v1.5`.

### Store a document

```
POST /v1/rag/documents
```

| Field          | Type    | Required | Description                                                                           |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------------- |
| `text`         | string  | Yes      | Document text (at most 500 chunks)                                                    |
| `metadata`     | object  | Yes      | Flat object (up to 10 KiB) that must contain `docId` (string, at most 256 characters) |
| `model`        | string  | No       | Embedding model                                                                       |
| `chunkSize`    | integer | No       | 100-2000 (default 1000)                                                               |
| `chunkOverlap` | integer | No       | At least 0 and less than half of `chunkSize` (default 200)                            |
| `namespace`    | string  | No       | Vectorize namespace (default `documents`)                                             |

Response: `{ "success": true, "document_id", "chunks_processed", "vectors_stored" }`. Re-ingesting the same `docId` replaces its vectors and removes stale trailing chunks.

### Delete a document

```
DELETE /v1/rag/documents/:docId?namespace=<namespace>
```

Deletes every chunk of the document. Response: `{ "id", "object": "rag.document.deleted", "deleted": true, "vectors_deleted" }`; `404` if the document does not exist.

### Search

```
POST /v1/rag/search
```

| Field             | Type    | Required | Description                                                             |
| ----------------- | ------- | -------- | ----------------------------------------------------------------------- |
| `query`           | string  | Yes      | Search query                                                            |
| `model`           | string  | No       | Embedding model                                                         |
| `top_k`           | integer | No       | Clamped to 1-20 (default 5)                                             |
| `score_threshold` | number  | No       | Minimum cosine score, -1 to 1 (default 0.7; an explicit `0` is honored) |
| `namespace`       | string  | No       | Vectorize namespace                                                     |

Response: `{ "query", "context", "sources": [{ "score", "metadata", "text" }] }` (`text` is a 200-character preview).

### RAG chat

```
POST /v1/rag/chat
```

Takes the same body as `/v1/chat/completions` (the last message must be from the user) plus `embedding_model`, `rag_top_k` (default 3, max 20), `rag_score_threshold` (default 0.7) and `namespace`. Retrieved context is injected as a system message and the request is handled by the chat endpoint. Non-streaming responses gain a `rag_sources` field; with `stream: true` the chat SSE response is returned unchanged.

---

## Error Codes

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request - Invalid parameters
- `401` - Unauthorized - Invalid or missing API key
- `403` - Forbidden - Insufficient permissions (also invalid image signatures)
- `404` - Not Found - Endpoint or resource not found
- `413` - Payload Too Large - File over the size limit
- `429` - Too Many Requests - Workers AI neuron quota or capacity exhausted
- `500` - Internal Server Error - Server error
- `501` - Not Implemented - Image storage (`IMAGE_BUCKET`) not bound
- `503` - Service Unavailable - Vectorize (`VECTOR_INDEX`) not bound

### Error Types

- `invalid_request_error` - Invalid request parameters
- `authentication_error` - Authentication failed
- `permission_error` - Permission denied
- `not_found_error` - Resource not found
- `rate_limit_exceeded` - Upstream quota or capacity exhausted
- `server_error` - Internal server error

### Workers AI error mapping

Errors from Workers AI are mapped by their numeric code (read from `error.code` or the message):

| Workers AI code                                        | HTTP status |
| ------------------------------------------------------ | ----------- |
| 3036 (daily neuron allocation), 3040 (out of capacity) | 429         |
| 3006 (request too large)                               | 413         |
| 3007, 3008 (timeout / aborted)                         | 408         |
| 3003, 5004, 5006, 5007, "Bad input"                    | 400         |
| 3023, 3041, 5016, 5018, 5035                           | 403         |
| 3042 (invalid model ID)                                | 404         |
| 5005 (LoRA unsupported)                                | 405         |

Unmapped errors return 500. Error logs never contain the `Authorization` header or cookies.

---

## Rate Limits

The gateway does **not** enforce rate limits and sends no `X-RateLimit-*` headers. Limits come from Cloudflare (Workers AI neuron quota → `429`) and from the per-request limits documented above (25 MB audio uploads, 4096-character TTS input, embedding batch sizes, ...). Add Cloudflare rate limiting rules in front of the Worker if you need per-key limits.

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

CORS headers are added to every response under `/v1`, including error responses and streams, and `OPTIONS` preflights are answered automatically:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
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
  "stream": true,
  "stream_options": { "include_usage": true }
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
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":20,"completion_tokens":2,"total_tokens":22}}

data: [DONE]
```

The `role` is sent only on the first delta, a final chunk carries `finish_reason` (`stop`, `length` or `tool_calls`), the usage chunk appears only with `stream_options.include_usage`, and `<think>…</think>` blocks are removed even when the tags are split across tokens.
