# Project Context

## Purpose
OpenAI-compatible API implementation using Cloudflare Workers AI that provides a drop-in replacement for OpenAI's API endpoints. The project enables developers to leverage Cloudflare's edge AI capabilities while maintaining OpenAI API compatibility, supporting chat completions, embeddings, audio processing, image generation, and RAG functionality.

## Tech Stack
- **Runtime**: Cloudflare Workers (V8 isolates)
- **Language**: JavaScript (ES2022 modules)
- **Router**: itty-router v5.0.18
- **AI Platform**: Cloudflare Workers AI
- **Storage**: Cloudflare KV (caching), R2 (file storage), Vectorize (embeddings)
- **State Management**: Durable Objects (rate limiting)
- **Testing**: Vitest v3.2.4
- **Tooling**: Wrangler v4.31.0, ESLint v9.0.0, Prettier v3.0.0

## Project Conventions

### Code Style
- **Indentation**: Tabs (2-space width)
- **Quotes**: Single quotes preferred
- **Semicolons**: Always required
- **Trailing Commas**: ES5 style (always-multiline)
- **Line Length**: Max 120 characters
- **Variables**: Prefer `const`/`let` over `var`, unused vars prefixed with `_`
- **Naming**: camelCase for variables/functions
- **Imports**: ES6 module imports, consistent style
- **Comments**: JSDoc for exported functions with parameter/return types

### Architecture Patterns
- **Route-based Architecture**: Separate handlers in `routes/` directory
- **Middleware Pattern**: Authentication and rate limiting as router middleware
- **Utility Separation**: Shared functionality in `utils/` directory
- **Error Handling**: Centralized error formatting in `utils/errors.js`
- **Model Mapping**: OpenAI model names to Cloudflare equivalents in `utils/models.js`
- **Streaming Support**: Server-sent events for real-time responses
- **Caching Strategy**: KV-based response caching with configurable TTL

### Testing Strategy
- **Unit Tests**: Vitest suite in `tests/unit/` covering all modules
- **Integration Tests**: Shell scripts in `tests/integration/` for API endpoints
- **Test Scripts**: Individual endpoint testing via `scripts/` directory
- **Coverage**: Vitest coverage reporting available
- **Validation**: Lint + unit tests required before commits

### Git Workflow
- **Branching**: Feature branches (`git checkout -b feature/amazing-feature`)
- **Commits**: Conventional commits with descriptive messages
- **Validation**: `npm run validate` (lint + unit tests) before commits
- **Deployment**: `npm run deploy` via Wrangler CLI

## Domain Context
This is an API gateway/proxy that translates OpenAI API calls to Cloudflare Workers AI. Key domain knowledge:
- **OpenAI API Compatibility**: Must maintain exact request/response formats
- **Model Mapping**: OpenAI model names → Cloudflare model identifiers
- **Edge Computing**: Global distribution, sub-100ms latency targets
- **Rate Limiting**: Distributed rate limiting using Durable Objects
- **Multimodal Support**: Text + image inputs for vision models
- **Function Calling**: OpenAI tools API implementation
- **Streaming**: Server-sent events for real-time chat responses

## Important Constraints
- **Cloudflare Platform**: Must work within Workers runtime limitations
- **Memory Limits**: 128MB memory per worker instance
- **CPU Time**: 50ms CPU time limit (can be extended)
- **Request Size**: 100MB request payload limit
- **Authentication**: Bearer token authentication required
- **CORS**: Must support cross-origin requests
- **Edge Compatibility**: No Node.js APIs, only Web APIs available

## External Dependencies
- **Cloudflare Workers AI**: Primary AI inference platform
- **Cloudflare KV**: Response caching (1-hour TTL default)
- **Cloudflare R2**: Large file storage (audio, images)
- **Cloudflare Vectorize**: Vector storage for embeddings/RAG
- **Cloudflare Durable Objects**: Distributed rate limiting
- **itty-router**: HTTP routing and middleware
- **Vitest**: Testing framework
- **Wrangler**: Deployment and development CLI
