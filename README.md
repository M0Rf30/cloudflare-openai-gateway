# OpenAI-Compatible API using Cloudflare Workers AI

A comprehensive OpenAI-compatible API implementation using Cloudflare Workers AI that provides chat completions, embeddings, audio transcription/translation, text-to-speech, and more.

## 🚀 Features

- **Complete OpenAI API Compatibility**: Drop-in replacement for OpenAI API endpoints
- **Multiple AI Capabilities**:
  - Chat completions with streaming support
  - Text completions
  - Text embeddings
  - Audio transcription (Speech-to-Text)
  - Audio translation
  - Text-to-Speech synthesis
  - Image generation
  - Retrieval-Augmented Generation (RAG)
- **Advanced Features**:
  - Function calling support (tools API)
  - Multimodal support (text + images)
  - Extensive model support (100+ models)
  - Automatic model mapping from OpenAI to Cloudflare equivalents
  - Context window management with automatic `max_tokens` calculation
  - Native tool calling for models with the `function-calling` capability, prompt-injection fallback for the rest
  - Optional response caching with Cloudflare KV (non-streaming chat completions, only when `CACHE_KV` is bound)
- **Robust Error Handling**: Comprehensive validation and error responses
- **Extensive Testing**: Vitest unit tests, plus live smoke-test scripts for every endpoint
- **Production Ready**: Proper authentication, CORS support, and logging

## 📚 API Endpoints

### Chat Completions

```
POST /v1/chat/completions
```

Compatible with OpenAI's chat completions API, supporting streaming and non-streaming responses, tool calling and multimodal inputs. Highlights (details in [API.md](API.md#chat-completions)):

- `temperature` (including `0`), `top_p`, `seed`, `frequency_penalty`, `presence_penalty`, `response_format` (`text`, `json_object`, `json_schema`), `max_tokens` / `max_completion_tokens` and `stop` (string or up to 4 strings, enforced by the gateway) are honored. `n` other than 1 returns 400.
- `usage` comes from the model when it reports one, otherwise it is estimated; `finish_reason` is `stop`, `length` or `tool_calls`. IDs are `chatcmpl-…`.
- `stream: true` returns real SSE content deltas (role only on the first chunk, a final `finish_reason` chunk, `stream_options.include_usage` supported, then `data: [DONE]`). `<think>…</think>` reasoning blocks are stripped.
- Models with the `function-calling` capability use native tool calling; other models get a prompt-injection fallback (streamed requests with injected tools run non-streaming upstream and are replayed as SSE).
- Remote `image_url` images must be http(s), `image/*` and at most 10 MB.

### Completions (Legacy)

```
POST /v1/completions
```

Compatible with OpenAI's completions API.

### Embeddings

```
POST /v1/embeddings
```

Generate text embeddings using Cloudflare's embedding models.

### Audio Transcription

```
POST /v1/audio/transcriptions
```

Transcribe audio files to text using Whisper models.

### Audio Translation

```
POST /v1/audio/translations
```

Translate audio files to English text.

### Text-to-Speech

```
POST /v1/audio/speech
```

Generate speech from text using various voices.

### Models

```
GET /v1/models
```

List the OpenAI-compatible aliases plus the live Workers AI catalog (see [MODELS.md](MODELS.md)). `created` is in seconds. Requires the `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets (500 otherwise); the upstream list is cached for 5 minutes.

### Image Generation

```
POST /v1/images/generations
```

Generate images from text prompts. Supports `response_format` (`url` or `b64_json`), `n` (1-4) and `size`. With `IMAGE_BUCKET` bound, `url` responses are signed, expiring links (1 hour); without it the image is returned as `b64_json` with a `warning`.

### Retrieve Generated Images

```
GET /v1/images/get/:name
```

Fetch a previously generated image. Needs no Bearer token: access is granted by the `exp`/`sig` query parameters of the signed URL returned by the generation endpoint (403 if invalid/expired, 404 if unknown, 501 if `IMAGE_BUCKET` is not bound).

### Retrieval-Augmented Generation (RAG)

```
POST   /v1/rag/documents
DELETE /v1/rag/documents/:docId
POST   /v1/rag/search
POST   /v1/rag/chat
```

Store documents (chunked, embedded and written to a native Vectorize namespace), delete a document (`DELETE /v1/rag/documents/:docId?namespace=`), search them, and perform RAG-enhanced chat completions (`stream: true` is supported and returned untouched).

### Decisions (System One API)

```
POST /v1/systemone
```

Typed decisions with Cloudflare's Clef models (`clef`, `clef-flash`, `clef-omni`). Clef returns probabilities for `noul`/`choice`/`score` questions instead of text, so it is not available through `/v1/chat/completions`.

## 🛠 Setup and Deployment

### Prerequisites

- Cloudflare Workers account
- Node.js 18+ and npm
- Wrangler CLI installed

### Installation

1. Clone the repository:

```bash
git clone https://github.com/M0Rf30/cloudflare-openai-gateway.git
cd cloudflare-openai-gateway
```

2. Install dependencies:

```bash
npm install
```

3. Configure your environment:

**For local development:**

```bash
# Copy the example environment file
cp .dev.vars.example .dev.vars

# Edit .dev.vars and add your values:
# - ACCESS_TOKEN: Your API access token for authentication
# - CLOUDFLARE_ACCOUNT_ID: Your Cloudflare account ID
# - CLOUDFLARE_API_TOKEN: Your Cloudflare API token (optional, for model updates)
```

**For production deployment:**

```bash
# Set secrets using wrangler (recommended for sensitive data)
wrangler secret put ACCESS_TOKEN
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put CLOUDFLARE_API_TOKEN

# Or set them in the Cloudflare dashboard under Workers > Your Worker > Settings > Variables
```

4. Update `wrangler.toml` with your resource IDs:

- Update the Vectorize index name (if using embeddings/RAG); the index dimensions must match your embedding model (768 for the default `bge-base-en-v1.5`, set `VECTOR_INDEX_DIMENSIONS` otherwise)
- Uncomment and update the R2 bucket names (if using image storage / TTS caching); `npm run init-dev` / `npm run init-prod` create the buckets
- Optionally uncomment the `CACHE_KV` namespace to enable chat response caching

> **Note**: Never commit sensitive credentials to `wrangler.toml`. Use `.dev.vars` for local development and `wrangler secret` for production.

5. Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## 🔧 Configuration

### Environment Variables

Set these in your Cloudflare Workers dashboard or via `wrangler secret`:

- `ACCESS_TOKEN`: API access token for authentication (also used to derive the image URL signing key). Requests are rejected if it is unset.
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token for listing models (`GET /v1/models`)
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID (`GET /v1/models`)
- `VECTOR_INDEX_DIMENSIONS` (optional, default `768`): dimensions of your Vectorize index
- `CACHE_TTL_SECONDS` (optional, default `3600`): TTL of the optional KV chat cache

Bindings (see `wrangler.toml`): `AI` (required), `VECTOR_INDEX` (embeddings/RAG), `IMAGE_BUCKET` (signed image URLs), `AUDIO_BUCKET` (TTS cache), `CACHE_KV` (optional chat cache).

> **Rate limiting**: the gateway does not rate-limit requests. Use Cloudflare rate limiting rules (or the Workers Rate Limiting binding) in front of it if you need that.

### Model Configuration

`utils/models.js` is generated by `npm run update-models` from the Workers AI catalog (see [MODELS.md](MODELS.md)).

Each endpoint has a model category, and a default used when `model` is omitted:

| Endpoint                                  | Default model                          |
| ----------------------------------------- | -------------------------------------- |
| `/v1/chat/completions`, `/v1/completions` | `@cf/openai/gpt-oss-120b`              |
| `/v1/embeddings`, `/v1/rag/*`             | `@cf/baai/bge-base-en-v1.5`            |
| `/v1/audio/transcriptions`                | `@cf/openai/whisper-large-v3-turbo`    |
| `/v1/audio/speech`                        | `@cf/myshell-ai/melotts`               |
| `/v1/images/generations`                  | `@cf/black-forest-labs/flux-1-schnell` |
| `/v1/systemone`                           | `@cf/cloudflare/clef`                  |

The API maps OpenAI model names to Cloudflare Workers AI models. **An alias only resolves inside a category that contains its target**: for example `text-embedding-ada-002` on `/v1/chat/completions`, or `text-moderation-latest` (→ `llama-guard-3-8b`, which is not a chat model) on any text endpoint, returns a 400. Cloudflare model IDs (`@cf/...`) can be passed directly.

#### Chat Models

- `gpt-3.5-turbo` → `@cf/meta/llama-3.1-8b-instruct-fp8`
- `gpt-4` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- `gpt-4o` → `@cf/meta/llama-3.2-11b-vision-instruct`
- `gpt-4-turbo` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- `gpt-3.5-turbo-16k` → `@cf/qwen/qwq-32b`
- `gpt-4-32k` → `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`
- `gpt-4o-mini` → `@cf/meta/llama-3.2-3b-instruct`
- `gpt-3.5-turbo-instruct` → `@cf/qwen/qwen2.5-coder-32b-instruct`
- `gpt-4-vision-preview` → `@cf/meta/llama-3.2-11b-vision-instruct`
- `code-davinci-002` → `@cf/qwen/qwen2.5-coder-32b-instruct`

#### Embedding Models

- `text-embedding-ada-002` → `@cf/baai/bge-base-en-v1.5`
- `text-embedding-3-small` → `@cf/baai/bge-small-en-v1.5`
- `text-embedding-3-large` → `@cf/baai/bge-large-en-v1.5`

#### Audio Models

- `whisper-1`, `whisper`, `whisper-large-v3-turbo` → `@cf/openai/whisper-large-v3-turbo`
- `whisper-tiny-en` → `@cf/openai/whisper-tiny-en`
- `tts-1`, `tts-1-hd` → `@cf/myshell-ai/melotts`
- Also supported by full ID: `@cf/openai/whisper`, `@cf/deepgram/nova-3` (STT) and `@cf/deepgram/aura-1`, `aura-2-en`, `aura-2-es` (TTS)

#### Image Models

- `dall-e-2`, `dall-e-3` → `@cf/black-forest-labs/flux-1-schnell`
- Also supported by full ID: `flux-2-klein-9b`, `flux-2-klein-4b`, `flux-2-dev`, `stable-diffusion-xl-base-1.0`, `stable-diffusion-xl-lightning`, `dreamshaper-8-lcm`, `phoenix-1.0`, `lucid-origin`

#### Decision Models

- `clef`, `clef-flash`, `clef-omni` are only available through `POST /v1/systemone`; chat endpoints reject them with a 400.

## 📖 Usage Examples

### Chat Completion

```javascript
const response = await fetch('https://your-worker.workers.dev/v1/chat/completions', {
	method: 'POST',
	headers: {
		'Authorization': 'Bearer your-token',
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		model: 'gpt-3.5-turbo',
		messages: [{ role: 'user', content: 'Hello!' }],
		max_tokens: 100,
	}),
});
```

### Chat Completion with Function Calling

```javascript
const response = await fetch('https://your-worker.workers.dev/v1/chat/completions', {
	method: 'POST',
	headers: {
		'Authorization': 'Bearer your-token',
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		model: 'gpt-4',
		messages: [{ role: 'user', content: 'What is the weather in New York?' }],
		tools: [
			{
				type: 'function',
				function: {
					name: 'get_current_weather',
					description: 'Get the current weather in a given location',
					parameters: {
						type: 'object',
						properties: {
							location: {
								type: 'string',
								description: 'The city and state, e.g. San Francisco, CA',
							},
							unit: {
								type: 'string',
								enum: ['celsius', 'fahrenheit'],
							},
						},
						required: ['location'],
					},
				},
			},
		],
		tool_choice: 'auto',
	}),
});
```

### Multimodal Chat Completion (Image + Text)

```javascript
const response = await fetch('https://your-worker.workers.dev/v1/chat/completions', {
	method: 'POST',
	headers: {
		'Authorization': 'Bearer your-token',
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		model: 'gpt-4o',
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: 'What is in this image?',
					},
					{
						type: 'image_url',
						image_url: {
							url: 'https://example.com/image.jpg',
						},
					},
				],
			},
		],
	}),
});
```

### Audio Transcription

```javascript
const formData = new FormData();
formData.append('file', audioFile);
formData.append('model', 'whisper-1');

const response = await fetch('https://your-worker.workers.dev/v1/audio/transcriptions', {
	method: 'POST',
	headers: {
		Authorization: 'Bearer your-token',
	},
	body: formData,
});
```

### Text Embeddings

```javascript
const response = await fetch('https://your-worker.workers.dev/v1/embeddings', {
	method: 'POST',
	headers: {
		'Authorization': 'Bearer your-token',
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		model: 'text-embedding-ada-002',
		input: 'Your text to embed',
	}),
});
```

### Text-to-Speech

```javascript
const response = await fetch('https://your-worker.workers.dev/v1/audio/speech', {
	method: 'POST',
	headers: {
		'Authorization': 'Bearer your-token',
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		model: 'tts-1',
		input: 'Hello, world!',
		voice: 'alloy',
	}),
});
```

### Image Generation

```javascript
const response = await fetch('https://your-worker.workers.dev/v1/images/generations', {
	method: 'POST',
	headers: {
		'Authorization': 'Bearer your-token',
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		model: 'dall-e-3',
		prompt: 'A cute baby sea otter',
		n: 1,
		size: '1024x1024',
	}),
});
```

### RAG Chat

```javascript
const response = await fetch('https://your-worker.workers.dev/v1/rag/chat', {
	method: 'POST',
	headers: {
		'Authorization': 'Bearer your-token',
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		model: 'gpt-3.5-turbo',
		messages: [{ role: 'user', content: 'What is the company policy on remote work?' }],
	}),
});
```

## 🧪 Testing

### Unit Tests

```bash
npm run test        # all tests
npm run test:unit   # tests/unit only
npm run test:coverage
```

### Live Endpoint Tests

The `scripts/` directory contains curl-based smoke tests that run against a running worker (`WORKER_URL`, default `http://localhost:8787/v1`, and `AUTH_TOKEN`). All scripts use `set -euo pipefail`.

```bash
# Run all tests
npm run test:all

# Run specific endpoint tests
npm run test:audio       # Audio endpoints (TTS, then transcription of the generated speech)
npm run test:completions # Chat completions
npm run test:embeddings  # Embeddings
npm run test:images      # Image generation
npm run test:models      # Models endpoint
npm run test:rag         # RAG endpoints
```

### Continuous Integration

`.github/workflows/ci.yml` runs `npm ci`, `npm run lint` and `npm run test:unit` on every push to `main` and every pull request. `.github/workflows/update-models.yml` refreshes `utils/models.js` from the Workers AI catalog (`npm ci`, tests, then opens a PR).

## 🔍 Development

### Code Structure

```
├── index.js                        # Worker entry point: router, CORS, Bearer auth
├── routes/                         # API route handlers
│   ├── audio.js                   # Audio transcription, translation, and TTS (per-model adapters)
│   ├── chat.js                    # Chat completions with streaming and tool calling
│   ├── completion.js              # Legacy text completions
│   ├── embeddings.js              # Text embeddings generation
│   ├── image.js                   # Image generation and signed-URL retrieval
│   ├── models.js                  # Model listing endpoint
│   ├── rag.js                     # Retrieval-Augmented Generation endpoints
│   └── systemone.js               # System One decision API (Clef models)
├── utils/                          # Utility functions
│   ├── binary.js                  # Base64 / hex / SHA-256 helpers
│   ├── cache.js                   # Optional response caching with Cloudflare KV
│   ├── converters.js              # Remote image fetching and conversion (size/type checked)
│   ├── errors.js                  # Error classes, Workers AI error mapping, log redaction
│   ├── format.js                  # Response normalization utilities
│   ├── functionCalling.js         # Prompt-injection tool calling and tool message conversion
│   ├── generation.js              # Shared chat/completion parameter handling
│   ├── models.js                  # Generated model configuration and mappings
│   ├── r2Storage.js               # Cloudflare R2 storage utilities
│   ├── stream.js                  # SSE stream transformers
│   └── vectorize.js               # Cloudflare Vectorize integration (RAG)
├── tests/unit/                     # Vitest unit tests
├── scripts/                        # Live smoke tests, deploy.sh and update-models.js
├── .github/workflows/              # ci.yml and update-models.yml
└── wrangler.toml                  # Cloudflare Workers configuration
```

### Development Scripts

```bash
# Start development server
npm run dev

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Validate codebase
npm run validate
```

## 🚨 Error Handling

The API returns OpenAI-compatible error responses:

```json
{
	"error": {
		"message": "Model gpt-4 (@cf/meta/llama-3.3-70b-instruct-fp8-fast) is not supported by the embeddings category",
		"type": "invalid_request_error",
		"param": "model"
	}
}
```

### Error Types

- `invalid_request_error` (400): Bad request parameters
- `authentication_error` (401): Invalid or missing API key
- `permission_error` (403): Insufficient permissions
- `not_found_error` (404): Endpoint or resource not found
- `rate_limit_exceeded` (429): Workers AI neuron quota or capacity exhausted (upstream 3036 / 3040)
- `server_error` (500): Internal server error

Workers AI error codes are mapped to HTTP statuses (3036/3040 → 429, 3006 → 413, 3003/5004/5006/5007 and "Bad input" → 400, 3023/5016/5018/5035/3041 → 403, 3042 → 404, 3007/3008 → 408). See [API.md](API.md#error-codes) for details. Error logs never contain the `Authorization` header or cookies.

## 🔐 Authentication

The API uses Bearer token authentication. Include your token in the Authorization header (the `Bearer` scheme is case-insensitive):

```
Authorization: Bearer your-access-token
```

A missing, malformed or wrong token returns `401` (`authentication_error`). If `ACCESS_TOKEN` is not configured every request is rejected. The only unauthenticated route is `GET /v1/images/get/:name`, which is protected by an HMAC-signed, expiring URL instead.

Set your access token using Wrangler:

```bash
wrangler secret put ACCESS_TOKEN
```

CORS headers are added to every response under `/v1` (including errors and streams); `OPTIONS` preflights are answered automatically.

## 📊 Monitoring and Logging

Errors are logged as structured JSON (client errors with `console.warn`, server errors with `console.error` and a stack). Only the `content-type`, `cf-ray` and `user-agent` request headers are logged. Workers observability is enabled in `wrangler.toml`.

Access logs through the Cloudflare Workers dashboard or use the Wrangler CLI:

```bash
wrangler tail
```

## 🚀 Performance

- **Edge Computing**: Deployed globally on Cloudflare's edge network
- **Scalability**: Automatically scales to handle traffic spikes
- **Caching**: Optional KV cache for non-streaming chat completions, 5-minute cache for the model list

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style (ESLint configuration provided)
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Cloudflare Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

## 📞 Support

For issues and questions:

1. Check the [Issues](https://github.com/M0Rf30/cloudflare-openai-gateway/issues) page
2. Create a new issue with detailed information
3. Include relevant logs and configuration details

---

**Note**: This is an unofficial implementation and is not affiliated with OpenAI. All trademarks are property of their respective owners.
