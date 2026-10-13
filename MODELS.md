# Cloudflare Workers AI Models

The model list changes often, so this gateway does not hand-maintain one. The source of truth is the
generated `utils/models.js` (refreshed from the Workers AI catalog by `npm run update-models`), served live by:

- `GET /v1/models` – every model with its category, context window and capabilities
  (`function-calling`, `vision`, `text-generation`, …).
- `GET /v1/models/:id` – one model.

## How the catalog is mapped

- **Context window**: the catalog `context_window` property. Manual overrides exist only for non-text models
  (image prompts, Whisper, embeddings) where the catalog reports no token limit or a different meaning.
- **Capabilities**: derived from the task, plus `function-calling` (`function_calling` property) and
  `vision` (`vision` property).
- **Categories**: derived from the task (`chat`, `completion`, `embeddings`, `audio_stt`, `audio_tts`,
  `image_generation`, `vision`, `classification`, `rag`, `decision`, …). Models the handlers cannot serve are
  left out: Clef decision models (use `POST /v1/systemone`), `llama-guard` (chat), the SD 1.5 inpainting model
  (image generation) and `deepgram/flux` (WebSocket-only STT).
- **Deprecated models** (flagged, or past `planned_deprecation_date`) are dropped.
- **Defaults** (used when `model` is omitted): chat/completion `@cf/openai/gpt-oss-120b`, images
  `@cf/black-forest-labs/flux-1-schnell`, STT `@cf/openai/whisper-large-v3-turbo`, TTS `@cf/myshell-ai/melotts`,
  embeddings/RAG `@cf/baai/bge-base-en-v1.5`, decision `@cf/cloudflare/clef`.
- **OpenAI aliases** (`gpt-4`, `text-embedding-ada-002`, `whisper-1`, `dall-e-3`, …) resolve only inside a
  category that contains their target; otherwise the request fails with a 400.

## Updating

```bash
npm run update-models   # needs wrangler login or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
```

The script exits non-zero if the chat category is empty, an alias target is missing from the catalog, or no
model has the `function-calling` capability.
