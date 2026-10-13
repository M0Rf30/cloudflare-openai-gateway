<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Agent Guidelines for cloudflare-openai-gateway

This document outlines the conventions and commands for agentic coding in this repository. Agents operating within this codebase **must** adhere to these guidelines to ensure consistency, maintainability, and successful task completion.

## Build, Lint, and Test Commands

- **Install Dependencies:** `npm ci` (or `npm install`)
- **Run All Tests:** `npm test` or `vitest run`
- **Run Unit Tests:** `npm run test:unit`
- **Coverage:** `npm run test:coverage`
- **Run a Single Test File:** `vitest run <path/to/test_file.test.js>`
- **Lint Code:** `npm run lint` (covers `*.js`, `routes/`, `utils/`, `tests/`, `scripts/`)
- **Fix Linting Issues:** `npm run lint:fix`
- **Format Code:** `npm run format`
- **Validate (Lint & Unit Tests):** `npm run validate` (this is what CI runs, as `lint` + `test:unit`)
- **Regenerate Models:** `npm run update-models` (needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; `update-models:dry-run` previews)
- **Live Smoke Tests:** `npm run test:all` / `test:audio` / `test:completions` / `test:embeddings` / `test:images` / `test:models` / `test:rag` (curl scripts in `scripts/`, need a running deployment)
- **Create R2 Buckets:** `npm run init-dev` / `npm run init-prod`

## Code Style Guidelines

- **Indentation:** Tabs (tab width 2 spaces).
- **Quotes:** Single quotes.
- **Semicolons:** Always use semicolons.
- **Trailing Commas:** Use trailing commas for multi-line object and array literals (ES5 style).
- **Line Length:** Max 120 characters.
- **Variable Declaration:** Prefer `const` and `let` over `var`.
- **Unused Variables:** Avoid unused variables; variables starting with `_` are ignored.
- **Error Handling:** Follow existing patterns in `utils/errors.js`.
- **Naming Conventions:** Adhere to existing camelCase for variables and functions.
- **Imports:** Use consistent import styles as seen in `routes/` and `utils/` files.
- **Function Comments:** Add JSDoc comments for exported functions with parameters and return types.
- **Type Checking:** Use JSDoc for type annotations where needed.

## Model Management

- **`utils/models.js` is generated** by `scripts/update-models.js` from the Workers AI catalog. Do not hand-edit it: change the generator (its template, `OPENAI_MODEL_MAPPINGS`, `PREFERRED_DEFAULTS`, `CATEGORY_EXCLUSIONS`, `CONTEXT_WINDOW_OVERRIDES`) and rerun `npm run update-models`.
- **Model Context Windows / Capabilities:** read from the catalog (`context_window`, `function_calling` → `function-calling`, `vision`) into `MODEL_CONTEXT_WINDOWS` and `MODEL_CAPABILITIES`. Deprecated models are skipped.
- **Model Categories:** `MODEL_CATEGORIES` groups models per endpoint (chat, completion, embeddings, audio_stt, audio_tts, image_generation, rag, decision, ...). Always resolve models with `resolveModel(category, name)`.
- **Alias rule:** an OpenAI alias in `MODEL_MAPPING` only resolves when its target belongs to the requested category; otherwise `resolveModel` throws a `ValidationError` (400). Clef decision models are only served by `/v1/systemone`.
- **Pinned defaults:** `DEFAULT_MODELS` (chat/completion `gpt-oss-120b`, images `flux-1-schnell`, STT `whisper-large-v3-turbo`, TTS `melotts`, embeddings/RAG `bge-base-en-v1.5`, decision `clef`).
- **Capabilities drive behavior:** tool calling is native only for models with `function-calling`; other models use the prompt-injection fallback in `utils/functionCalling.js`.

## Architecture Notes

- **Router (`index.js`):** itty-router v5 with `cors()` preflight/`corsify` at router level (CORS on every response, including errors and streams) and a router-level `catch` that formats errors. Bearer auth is case-insensitive, compares SHA-256 digests in constant time and returns 401. `GET /v1/images/get/:name` skips Bearer auth because it verifies an HMAC-signed, expiring URL.
- **Errors:** throw the classes from `utils/errors.js` (`ValidationError`, `NotFoundError`, ...) and wrap handlers in `asyncErrorHandler`. Workers AI errors are mapped to HTTP statuses by numeric code (`mapUpstreamError`, e.g. 3036/3040 → 429). Never log request headers other than the allowlist in `logError`.
- **Shared generation parameters:** chat and completions use `utils/generation.js` (`resolveGenerationParams`): `temperature` 0 and `top_p` are forwarded, `n` must be 1, `stop` is enforced by the gateway, `max_completion_tokens` maps to `max_tokens`.
- **Streaming:** `utils/stream.js` transformers are line-buffered SSE parsers with a think-stripping state machine; keep new streaming logic there.
- **Binary data:** use the chunked encoder `arrayBufferToBase64` from `utils/format.js` and helpers in `utils/binary.js`; never build per-byte JS arrays or string concatenations for large buffers.
- **Bindings:** `AI` (required), `VECTOR_INDEX`, `IMAGE_BUCKET`, `AUDIO_BUCKET`, optional `CACHE_KV`. Handlers must degrade cleanly when an optional binding is missing (501/503/base64 fallback). There is no rate limiter and no Durable Object; do not reintroduce `X-RateLimit-*` claims.

## Testing Guidelines

- **Unit Tests:** Located in `tests/unit/` with corresponding `.test.js` files; routes are exercised with mocked `env.AI` / R2 / Vectorize.
- **Router Tests:** `tests/unit/index.test.js` goes through `default.fetch` (auth, CORS, 404).
- **Test Scripts:** Use the curl scripts in `scripts/` for live smoke tests; they use `set -euo pipefail`.
- **CI:** `.github/workflows/ci.yml` runs `npm ci`, `npm run lint` and `npm run test:unit` on push/PR; `update-models.yml` regenerates the model catalog and opens a PR.

## API Routes

- **Route Handlers:** Each route has its own file in `routes/` (audio, chat, completion, embeddings, image, models, rag, systemone).
- **Utilities:** Shared functionality is in `utils/`.
- **Validation:** Handlers validate their own input and throw `ValidationError` (see `utils/errors.js`); there is no separate validation module.
- **Docs:** Keep `README.md`, `API.md` and `MODELS.md` in sync with route behavior when parameters, limits or defaults change.

## Cursor/Copilot Rules

No specific Cursor or Copilot instruction files were found in this repository.
