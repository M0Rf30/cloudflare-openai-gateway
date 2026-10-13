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
  - Context window management with automatic max_tokens calculation
  - Response caching with Cloudflare KV
  - Rate limiting with Durable Objects
- **Robust Error Handling**: Comprehensive validation and error responses
- **Extensive Testing**: Unit tests and integration tests included
- **Production Ready**: Proper authentication, CORS support, and logging

## 📚 API Endpoints

### Chat Completions

```
POST /v1/chat/completions
```

Compatible with OpenAI's chat completions API, supporting streaming and non-streaming responses, function calling (tools API), and multimodal inputs.

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

List all available AI models.

> **Note**: The `@cf/openai/gpt-oss-120b` and `@cf/openai/gpt-oss-20b` models require special handling - they use the `input` parameter instead of `prompt`/`messages`. The API automatically handles this conversion.

### Image Generation

```
POST /v1/images/generations
```

Generate images from text prompts.

### Retrieve Generated Images

```
GET /v1/images/get/:name
```

Retrieve previously generated images by name.

### Retrieval-Augmented Generation (RAG)

```
POST /v1/rag/documents
POST /v1/rag/search
POST /v1/rag/chat
```

Store documents for RAG, search documents, and perform RAG-enhanced chat completions.

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
git clone https://github.com/M0Rf30/openai-cf-workers-ai.git
cd openai-cf-workers-ai
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

- Update KV namespace IDs (if using caching)
- Update Vectorize index name (if using embeddings/RAG)
- Update R2 bucket names (if using audio/image storage)

> **Note**: Never commit sensitive credentials to `wrangler.toml`. Use `.dev.vars` for local development and `wrangler secret` for production.

5. Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## 🔧 Configuration

### Environment Variables

Set these in your Cloudflare Workers dashboard or via `wrangler secret`:

- `ACCESS_TOKEN`: API access token for authentication
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token for accessing model information
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID (in wrangler.toml)

### Model Configuration

The API automatically maps OpenAI model names to Cloudflare Workers AI models:

#### Chat Models

- `gpt-3.5-turbo` → `@cf/meta/llama-3.1-8b-instruct-fp8`
- `gpt-4` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- `gpt-4o` → `@cf/meta/llama-3.2-11b-vision-instruct`
- `gpt-4-turbo` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- `gpt-3.5-turbo-16k` → `@cf/qwen/qwq-32b`
- `gpt-4-32k` → `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`
- `gpt-4o-mini` → `@cf/meta/llama-3.2-3b-instruct`
- `gpt-3.5-turbo-instruct` → `@cf/qwen/qwen2.5-coder-32b-instruct`

#### Embedding Models

- `text-embedding-ada-002` → `@cf/baai/bge-base-en-v1.5`
- `text-embedding-3-small` → `@cf/baai/bge-small-en-v1.5`
- `text-embedding-3-large` → `@cf/baai/bge-large-en-v1.5`

#### Audio Models

- `whisper-1` → `@cf/openai/whisper-large-v3-turbo`
- `whisper` → `@cf/openai/whisper-large-v3-turbo`
- `whisper-tiny-en` → `@cf/openai/whisper-tiny-en`
- `whisper-large-v3-turbo` → `@cf/openai/whisper-large-v3-turbo`
- `tts-1` → `@cf/myshell-ai/melotts`
- `tts-1-hd` → `@cf/myshell-ai/melotts`

#### Image Models

- `dall-e-2` → `@cf/black-forest-labs/flux-1-schnell`
- `dall-e-3` → `@cf/black-forest-labs/flux-1-schnell`

#### Vision Models

- `gpt-4-vision-preview` → `@cf/meta/llama-3.2-11b-vision-instruct`

#### Code Models

- `code-davinci-002` → `@cf/qwen/qwen2.5-coder-32b-instruct`

#### Moderation Models

- `text-moderation-latest` → `@cf/meta/llama-guard-3-8b`
- `text-moderation-stable` → `@cf/meta/llama-guard-3-8b`

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
npm run test
```

### Integration Tests

```bash
npm run test:integration
```

### Individual Endpoint Tests

The project includes simple test scripts for each API endpoint:

```bash
# Run all tests
npm run test:all

# Run specific endpoint tests
npm run test:audio      # Audio endpoints (transcription, translation, TTS)
npm run test:completions # Chat completions
npm run test:embeddings  # Embeddings
npm run test:images      # Image generation
npm run test:models      # Models endpoint
npm run test:rag         # RAG endpoints
```

Test scripts are located in the `scripts/` directory with a flat structure.

## 🔍 Development

### Code Structure

```
├── index.js                        # Main worker entry point
├── routes/                         # API route handlers
│   ├── audio.js                   # Audio transcription, translation, and TTS
│   ├── chat.js                    # Chat completions with streaming and function calling
│   ├── completion.js              # Legacy text completions
│   ├── embeddings.js              # Text embeddings generation
│   ├── image.js                   # Image generation and retrieval
│   ├── models.js                  # Model listing endpoint
│   └── rag.js                     # Retrieval-Augmented Generation endpoints
├── utils/                          # Utility functions
│   ├── cache.js                   # Response caching with Cloudflare KV
│   ├── converters.js              # Data format converters (images, etc.)
│   ├── DistributedRateLimiter.js  # Durable Object for distributed rate limiting
│   ├── errors.js                  # Error handling and formatting
│   ├── format.js                  # Response formatting utilities
│   ├── functionCalling.js         # Function calling (tools) processing
│   ├── ids.js                     # ID generation utilities (UUID, random IDs)
│   ├── models.js                  # Model configuration and mappings
│   ├── r2Storage.js               # Cloudflare R2 storage utilities
│   ├── stream.js                  # Streaming response processing
│   └── vectorize.js               # Cloudflare Vectorize integration
├── tests/                          # Test suites
│   ├── unit/                      # Unit tests for all modules
│   │   ├── audio.test.js         # Tests for audio endpoints
│   │   ├── chat.test.js          # Tests for chat completions
│   │   ├── embeddings.test.js    # Tests for embeddings
│   │   ├── models.test.js        # Tests for models endpoint
│   │   ├── multimodal.test.js    # Tests for multimodal inputs
│   │   ├── rag.test.js           # Tests for RAG endpoints
│   │   └── stt.test.js           # Tests for speech-to-text
│   └── integration/               # Integration tests
├── scripts/                        # Test scripts for each endpoint
│   ├── test_all.sh               # Run all endpoint tests
│   ├── test_audio.sh             # Test audio endpoints
│   ├── test_completions.sh       # Test chat completions
│   ├── test_embeddings.sh        # Test embeddings
│   ├── test_images.sh            # Test image generation
│   ├── test_models.sh            # Test models endpoint
│   └── test_rag.sh               # Test RAG endpoints
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

The API provides comprehensive error handling with OpenAI-compatible error responses:

```json
{
	"error": {
		"message": "Invalid model: invalid-model. Available models: gpt-3.5-turbo, gpt-4",
		"type": "invalid_request_error",
		"param": "model"
	}
}
```

### Error Types

- `invalid_request_error` (400): Bad request parameters
- `authentication_error` (401): Invalid or missing API key
- `permission_error` (403): Insufficient permissions
- `not_found_error` (404): Endpoint not found
- `rate_limit_exceeded` (429): Too many requests
- `server_error` (500): Internal server error

## 🔐 Authentication

The API uses Bearer token authentication. Include your token in the Authorization header:

```
Authorization: Bearer your-access-token
```

Set your access token using Wrangler:

```bash
wrangler secret put ACCESS_TOKEN
```

## 📊 Monitoring and Logging

The API includes comprehensive logging for debugging and monitoring:

- Request/response logging
- Error tracking with context
- Performance metrics
- AI model usage tracking

Access logs through the Cloudflare Workers dashboard or use the Wrangler CLI:

```bash
wrangler tail
```

## 🚀 Performance

- **Edge Computing**: Deployed globally on Cloudflare's edge network
- **Low Latency**: Sub-100ms response times for most endpoints
- **High Availability**: 99.9%+ uptime with automatic failover
- **Scalability**: Automatically scales to handle traffic spikes
- **Caching**: Response caching with Cloudflare KV to reduce latency and costs

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

1. Check the [Issues](https://github.com/M0Rf30/openai-cf-workers-ai/issues) page
2. Create a new issue with detailed information
3. Include relevant logs and configuration details

---

**Note**: This is an unofficial implementation and is not affiliated with OpenAI. All trademarks are property of their respective owners.
