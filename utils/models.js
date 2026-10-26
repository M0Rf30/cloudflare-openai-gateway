// Unified models configuration for Cloudflare Workers AI
// This file contains all supported models organized by category with context windows
//
// Auto-generated on: 2026-10-26T16:01:52.829Z
// To update: npm run update-models

import { ValidationError } from './errors.js';

// === CONTEXT WINDOW MAPPING ===
export const MODEL_CONTEXT_WINDOWS = {
	"@cf/pipecat-ai/smart-turn-v2": 4096,
	"@cf/openai/gpt-oss-120b": 128000,
	"@cf/baai/bge-m3": 8192,
	"@cf/huggingface/distilbert-sst-2-int8": 4096,
	"@cf/google/gemma-2b-it-lora": 8192,
	"@cf/black-forest-labs/flux-2-klein-9b": 4096,
	"@cf/meta/llama-3.2-3b-instruct": 80000,
	"@cf/meta/llama-guard-3-8b": 131072,
	"@cf/qwen/qwen3-embedding-0.6b": 8192,
	"@cf/myshell-ai/melotts": 4096,
	"@cf/mistral/mistral-7b-instruct-v0.2-lora": 15000,
	"@cf/deepgram/aura-2-es": 4096,
	"@cf/moonshotai/kimi-k2.7-code": 262144,
	"@cf/openai/whisper": 30,
	"@cf/zai-org/glm-5.3": 1048576,
	"@cf/utter-project/eurollm-9b-it": 32000,
	"@cf/pfnet/plamo-embedding-1b": 4096,
	"@cf/llava-hf/llava-1.5-7b-hf": 4096,
	"@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": 80000,
	"@cf/runwayml/stable-diffusion-v1-5-inpainting": 4096,
	"@cf/deepgram/flux": 4096,
	"@cf/deepgram/nova-3": 4096,
	"@cf/black-forest-labs/flux-1-schnell": 77,
	"@cf/meta/llama-3.1-8b-instruct-fp8": 32000,
	"@cf/zai-org/glm-5.3-flash": 1048576,
	"@cf/meta/llama-3.2-1b-instruct": 60000,
	"@cf/moonshotai/kimi-k2.6": 262144,
	"@cf/cloudflare/clef": 65536,
	"@cf/zai-org/glm-4.7-flash": 131072,
	"@cf/microsoft/resnet-50": 4096,
	"@cf/bytedance/stable-diffusion-xl-lightning": 77,
	"@cf/meta-llama/llama-2-7b-chat-hf-lora": 8192,
	"@cf/meta/llama-3.3-70b-instruct-fp8-fast": 24000,
	"@cf/ibm-granite/granite-4.0-h-micro": 131000,
	"@cf/lykon/dreamshaper-8-lcm": 4096,
	"@cf/deepseek-ai/deepseek-v4-flash-0731": 1048576,
	"@cf/leonardo/phoenix-1.0": 4096,
	"@cf/stabilityai/stable-diffusion-xl-base-1.0": 4096,
	"@cf/cloudflare/clairic": 65536,
	"@cf/meta/m2m100-1.2b": 4096,
	"@cf/ai4bharat/indictrans2-en-indic-1B": 4096,
	"@cf/black-forest-labs/flux-2-klein-4b": 4096,
	"@cf/baai/bge-small-en-v1.5": 512,
	"@cf/swiss-ai/apertus-v1.5-8b": 262144,
	"@cf/cloudflare/clef-omni": 65536,
	"@cf/qwen/qwen2.5-coder-32b-instruct": 32768,
	"@cf/zai-org/glm-5.2": 262144,
	"@cf/nvidia/nemotron-3-120b-a12b": 256000,
	"@cf/baai/bge-base-en-v1.5": 512,
	"@cf/aisingapore/gemma-sea-lion-v4-27b-it": 128000,
	"@cf/qwen/qwen3-30b-a3b-fp8": 32768,
	"@cf/black-forest-labs/flux-2-dev": 4096,
	"@cf/google/gemma-7b-it-lora": 3500,
	"@cf/google/gemma-4-26b-a4b-it": 256000,
	"@cf/mistralai/mistral-small-3.1-24b-instruct": 128000,
	"@cf/deepseek-ai/deepseek-v4-pro-0813": 1048576,
	"@cf/meta/llama-3.2-11b-vision-instruct": 128000,
	"@cf/daily-co/phonellm-mini-alpha-2": 262140,
	"@cf/qwen/qwen3.8-27b": 262144,
	"@cf/openai/whisper-tiny-en": 30,
	"@cf/deepseek-ai/deepseek-v4.1-flash-1017": 1048576,
	"@cf/openai/whisper-large-v3-turbo": 30,
	"@cf/deepgram/aura-1": 4096,
	"@cf/openai/gpt-oss-20b": 128000,
	"@cf/google/embeddinggemma-300m": 4096,
	"@cf/baai/bge-reranker-base": 4096,
	"@cf/moondream/moondream3.1-9B-A2B": 4096,
	"@cf/leonardo/lucid-origin": 4096,
	"@cf/meta/llama-4-scout-17b-16e-instruct": 131000,
	"@cf/cloudflare/clef-flash": 24576,
	"@cf/qwen/qwq-32b": 24000,
	"@cf/baai/bge-large-en-v1.5": 512,
	"@cf/deepgram/aura-2-en": 4096
};

// === ORIGINAL MODEL CATEGORIES ===
export const MODEL_CATEGORIES = {
	"chat": [
		"@cf/openai/gpt-oss-120b",
		"@cf/google/gemma-2b-it-lora",
		"@cf/meta/llama-3.2-3b-instruct",
		"@cf/mistral/mistral-7b-instruct-v0.2-lora",
		"@cf/moonshotai/kimi-k2.7-code",
		"@cf/zai-org/glm-5.3",
		"@cf/utter-project/eurollm-9b-it",
		"@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
		"@cf/meta/llama-3.1-8b-instruct-fp8",
		"@cf/zai-org/glm-5.3-flash",
		"@cf/meta/llama-3.2-1b-instruct",
		"@cf/moonshotai/kimi-k2.6",
		"@cf/zai-org/glm-4.7-flash",
		"@cf/meta-llama/llama-2-7b-chat-hf-lora",
		"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		"@cf/ibm-granite/granite-4.0-h-micro",
		"@cf/deepseek-ai/deepseek-v4-flash-0731",
		"@cf/cloudflare/clairic",
		"@cf/swiss-ai/apertus-v1.5-8b",
		"@cf/qwen/qwen2.5-coder-32b-instruct",
		"@cf/zai-org/glm-5.2",
		"@cf/nvidia/nemotron-3-120b-a12b",
		"@cf/aisingapore/gemma-sea-lion-v4-27b-it",
		"@cf/qwen/qwen3-30b-a3b-fp8",
		"@cf/google/gemma-7b-it-lora",
		"@cf/google/gemma-4-26b-a4b-it",
		"@cf/mistralai/mistral-small-3.1-24b-instruct",
		"@cf/deepseek-ai/deepseek-v4-pro-0813",
		"@cf/meta/llama-3.2-11b-vision-instruct",
		"@cf/daily-co/phonellm-mini-alpha-2",
		"@cf/qwen/qwen3.8-27b",
		"@cf/deepseek-ai/deepseek-v4.1-flash-1017",
		"@cf/openai/gpt-oss-20b",
		"@cf/meta/llama-4-scout-17b-16e-instruct",
		"@cf/qwen/qwq-32b"
	],
	"completion": [
		"@cf/openai/gpt-oss-120b",
		"@cf/google/gemma-2b-it-lora",
		"@cf/meta/llama-3.2-3b-instruct",
		"@cf/mistral/mistral-7b-instruct-v0.2-lora",
		"@cf/moonshotai/kimi-k2.7-code",
		"@cf/zai-org/glm-5.3",
		"@cf/utter-project/eurollm-9b-it",
		"@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
		"@cf/meta/llama-3.1-8b-instruct-fp8",
		"@cf/zai-org/glm-5.3-flash",
		"@cf/meta/llama-3.2-1b-instruct",
		"@cf/moonshotai/kimi-k2.6",
		"@cf/zai-org/glm-4.7-flash",
		"@cf/meta-llama/llama-2-7b-chat-hf-lora",
		"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		"@cf/ibm-granite/granite-4.0-h-micro",
		"@cf/deepseek-ai/deepseek-v4-flash-0731",
		"@cf/cloudflare/clairic",
		"@cf/swiss-ai/apertus-v1.5-8b",
		"@cf/qwen/qwen2.5-coder-32b-instruct",
		"@cf/zai-org/glm-5.2",
		"@cf/nvidia/nemotron-3-120b-a12b",
		"@cf/aisingapore/gemma-sea-lion-v4-27b-it",
		"@cf/qwen/qwen3-30b-a3b-fp8",
		"@cf/google/gemma-7b-it-lora",
		"@cf/google/gemma-4-26b-a4b-it",
		"@cf/mistralai/mistral-small-3.1-24b-instruct",
		"@cf/deepseek-ai/deepseek-v4-pro-0813",
		"@cf/meta/llama-3.2-11b-vision-instruct",
		"@cf/daily-co/phonellm-mini-alpha-2",
		"@cf/qwen/qwen3.8-27b",
		"@cf/deepseek-ai/deepseek-v4.1-flash-1017",
		"@cf/openai/gpt-oss-20b",
		"@cf/meta/llama-4-scout-17b-16e-instruct",
		"@cf/qwen/qwq-32b"
	],
	"embeddings": [
		"@cf/baai/bge-m3",
		"@cf/qwen/qwen3-embedding-0.6b",
		"@cf/pfnet/plamo-embedding-1b",
		"@cf/baai/bge-small-en-v1.5",
		"@cf/baai/bge-base-en-v1.5",
		"@cf/google/embeddinggemma-300m",
		"@cf/baai/bge-large-en-v1.5"
	],
	"audio_stt": [
		"@cf/openai/whisper",
		"@cf/deepgram/nova-3",
		"@cf/openai/whisper-tiny-en",
		"@cf/openai/whisper-large-v3-turbo"
	],
	"audio_tts": [
		"@cf/myshell-ai/melotts",
		"@cf/deepgram/aura-2-es",
		"@cf/deepgram/aura-1",
		"@cf/deepgram/aura-2-en"
	],
	"audio_translation": [
		"@cf/meta/m2m100-1.2b",
		"@cf/ai4bharat/indictrans2-en-indic-1B"
	],
	"image_generation": [
		"@cf/black-forest-labs/flux-2-klein-9b",
		"@cf/black-forest-labs/flux-1-schnell",
		"@cf/bytedance/stable-diffusion-xl-lightning",
		"@cf/lykon/dreamshaper-8-lcm",
		"@cf/leonardo/phoenix-1.0",
		"@cf/stabilityai/stable-diffusion-xl-base-1.0",
		"@cf/black-forest-labs/flux-2-klein-4b",
		"@cf/black-forest-labs/flux-2-dev",
		"@cf/leonardo/lucid-origin"
	],
	"vision": [
		"@cf/llava-hf/llava-1.5-7b-hf",
		"@cf/moondream/moondream3.1-9B-A2B"
	],
	"classification": [
		"@cf/huggingface/distilbert-sst-2-int8",
		"@cf/microsoft/resnet-50",
		"@cf/baai/bge-reranker-base"
	],
	"rag": [
		"@cf/baai/bge-m3",
		"@cf/qwen/qwen3-embedding-0.6b",
		"@cf/pfnet/plamo-embedding-1b",
		"@cf/baai/bge-small-en-v1.5",
		"@cf/baai/bge-base-en-v1.5",
		"@cf/google/embeddinggemma-300m",
		"@cf/baai/bge-large-en-v1.5"
	],
	"decision": [
		"@cf/cloudflare/clef",
		"@cf/cloudflare/clef-omni",
		"@cf/cloudflare/clef-flash"
	]
};

// OpenAI-compatible model name mappings. An alias only resolves inside a category that contains its target.
export const MODEL_MAPPING = {
	"gpt-3.5-turbo": "@cf/meta/llama-3.1-8b-instruct-fp8",
	"gpt-4": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
	"gpt-4o": "@cf/meta/llama-3.2-11b-vision-instruct",
	"gpt-4-turbo": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
	"gpt-3.5-turbo-16k": "@cf/qwen/qwq-32b",
	"gpt-4-32k": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
	"gpt-4o-mini": "@cf/meta/llama-3.2-3b-instruct",
	"gpt-3.5-turbo-instruct": "@cf/qwen/qwen2.5-coder-32b-instruct",
	"text-embedding-ada-002": "@cf/baai/bge-base-en-v1.5",
	"text-embedding-3-small": "@cf/baai/bge-small-en-v1.5",
	"text-embedding-3-large": "@cf/baai/bge-large-en-v1.5",
	"whisper-1": "@cf/openai/whisper-large-v3-turbo",
	"whisper": "@cf/openai/whisper-large-v3-turbo",
	"whisper-tiny-en": "@cf/openai/whisper-tiny-en",
	"whisper-large-v3-turbo": "@cf/openai/whisper-large-v3-turbo",
	"tts-1": "@cf/myshell-ai/melotts",
	"tts-1-hd": "@cf/myshell-ai/melotts",
	"dall-e-2": "@cf/black-forest-labs/flux-1-schnell",
	"dall-e-3": "@cf/black-forest-labs/flux-1-schnell",
	"gpt-4-vision-preview": "@cf/meta/llama-3.2-11b-vision-instruct",
	"text-moderation-latest": "@cf/meta/llama-guard-3-8b",
	"text-moderation-stable": "@cf/meta/llama-guard-3-8b",
	"code-davinci-002": "@cf/qwen/qwen2.5-coder-32b-instruct",
	"rerank-001": "@cf/baai/bge-reranker-base"
};

// Model capabilities
export const MODEL_CAPABILITIES = {
	"@cf/openai/gpt-oss-120b": [
		"text-generation",
		"function-calling"
	],
	"@cf/baai/bge-m3": [
		"embeddings"
	],
	"@cf/huggingface/distilbert-sst-2-int8": [
		"text-classification"
	],
	"@cf/google/gemma-2b-it-lora": [
		"text-generation"
	],
	"@cf/black-forest-labs/flux-2-klein-9b": [
		"image-generation"
	],
	"@cf/meta/llama-3.2-3b-instruct": [
		"text-generation"
	],
	"@cf/meta/llama-guard-3-8b": [
		"text-generation"
	],
	"@cf/qwen/qwen3-embedding-0.6b": [
		"embeddings"
	],
	"@cf/myshell-ai/melotts": [
		"text-to-speech"
	],
	"@cf/mistral/mistral-7b-instruct-v0.2-lora": [
		"text-generation"
	],
	"@cf/deepgram/aura-2-es": [
		"text-to-speech"
	],
	"@cf/moonshotai/kimi-k2.7-code": [
		"text-generation",
		"function-calling",
		"vision"
	],
	"@cf/openai/whisper": [
		"speech-to-text"
	],
	"@cf/zai-org/glm-5.3": [
		"text-generation",
		"function-calling"
	],
	"@cf/utter-project/eurollm-9b-it": [
		"text-generation",
		"function-calling"
	],
	"@cf/pfnet/plamo-embedding-1b": [
		"embeddings"
	],
	"@cf/llava-hf/llava-1.5-7b-hf": [
		"vision"
	],
	"@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": [
		"text-generation"
	],
	"@cf/runwayml/stable-diffusion-v1-5-inpainting": [
		"image-generation"
	],
	"@cf/deepgram/flux": [
		"speech-to-text"
	],
	"@cf/deepgram/nova-3": [
		"speech-to-text"
	],
	"@cf/black-forest-labs/flux-1-schnell": [
		"image-generation"
	],
	"@cf/meta/llama-3.1-8b-instruct-fp8": [
		"text-generation"
	],
	"@cf/zai-org/glm-5.3-flash": [
		"text-generation",
		"function-calling",
		"vision"
	],
	"@cf/meta/llama-3.2-1b-instruct": [
		"text-generation"
	],
	"@cf/moonshotai/kimi-k2.6": [
		"text-generation",
		"function-calling",
		"vision"
	],
	"@cf/cloudflare/clef": [
		"decision"
	],
	"@cf/zai-org/glm-4.7-flash": [
		"text-generation",
		"function-calling"
	],
	"@cf/microsoft/resnet-50": [
		"image-classification"
	],
	"@cf/bytedance/stable-diffusion-xl-lightning": [
		"image-generation"
	],
	"@cf/meta-llama/llama-2-7b-chat-hf-lora": [
		"text-generation"
	],
	"@cf/meta/llama-3.3-70b-instruct-fp8-fast": [
		"text-generation",
		"function-calling"
	],
	"@cf/ibm-granite/granite-4.0-h-micro": [
		"text-generation",
		"function-calling"
	],
	"@cf/lykon/dreamshaper-8-lcm": [
		"image-generation"
	],
	"@cf/deepseek-ai/deepseek-v4-flash-0731": [
		"text-generation",
		"function-calling"
	],
	"@cf/leonardo/phoenix-1.0": [
		"image-generation"
	],
	"@cf/stabilityai/stable-diffusion-xl-base-1.0": [
		"image-generation"
	],
	"@cf/cloudflare/clairic": [
		"text-generation",
		"vision"
	],
	"@cf/meta/m2m100-1.2b": [
		"translation"
	],
	"@cf/ai4bharat/indictrans2-en-indic-1B": [
		"translation"
	],
	"@cf/black-forest-labs/flux-2-klein-4b": [
		"image-generation"
	],
	"@cf/baai/bge-small-en-v1.5": [
		"embeddings"
	],
	"@cf/swiss-ai/apertus-v1.5-8b": [
		"text-generation",
		"function-calling",
		"vision"
	],
	"@cf/cloudflare/clef-omni": [
		"decision"
	],
	"@cf/qwen/qwen2.5-coder-32b-instruct": [
		"text-generation"
	],
	"@cf/zai-org/glm-5.2": [
		"text-generation",
		"function-calling"
	],
	"@cf/nvidia/nemotron-3-120b-a12b": [
		"text-generation",
		"function-calling"
	],
	"@cf/baai/bge-base-en-v1.5": [
		"embeddings"
	],
	"@cf/aisingapore/gemma-sea-lion-v4-27b-it": [
		"text-generation"
	],
	"@cf/qwen/qwen3-30b-a3b-fp8": [
		"text-generation",
		"function-calling"
	],
	"@cf/black-forest-labs/flux-2-dev": [
		"image-generation"
	],
	"@cf/google/gemma-7b-it-lora": [
		"text-generation"
	],
	"@cf/google/gemma-4-26b-a4b-it": [
		"text-generation",
		"function-calling",
		"vision"
	],
	"@cf/mistralai/mistral-small-3.1-24b-instruct": [
		"text-generation",
		"function-calling",
		"vision"
	],
	"@cf/deepseek-ai/deepseek-v4-pro-0813": [
		"text-generation",
		"function-calling"
	],
	"@cf/meta/llama-3.2-11b-vision-instruct": [
		"text-generation",
		"vision"
	],
	"@cf/daily-co/phonellm-mini-alpha-2": [
		"text-generation",
		"function-calling"
	],
	"@cf/qwen/qwen3.8-27b": [
		"text-generation",
		"function-calling",
		"vision"
	],
	"@cf/openai/whisper-tiny-en": [
		"speech-to-text"
	],
	"@cf/deepseek-ai/deepseek-v4.1-flash-1017": [
		"text-generation",
		"function-calling",
		"vision"
	],
	"@cf/openai/whisper-large-v3-turbo": [
		"speech-to-text"
	],
	"@cf/deepgram/aura-1": [
		"text-to-speech"
	],
	"@cf/openai/gpt-oss-20b": [
		"text-generation",
		"function-calling"
	],
	"@cf/google/embeddinggemma-300m": [
		"embeddings"
	],
	"@cf/baai/bge-reranker-base": [
		"text-classification"
	],
	"@cf/moondream/moondream3.1-9B-A2B": [
		"vision"
	],
	"@cf/leonardo/lucid-origin": [
		"image-generation"
	],
	"@cf/meta/llama-4-scout-17b-16e-instruct": [
		"text-generation",
		"function-calling",
		"vision"
	],
	"@cf/cloudflare/clef-flash": [
		"decision"
	],
	"@cf/qwen/qwq-32b": [
		"text-generation"
	],
	"@cf/baai/bge-large-en-v1.5": [
		"embeddings"
	],
	"@cf/deepgram/aura-2-en": [
		"text-to-speech"
	]
};

// Default model for each category (preferred model when present in the catalog, else the first entry)
export const DEFAULT_MODELS = {
	"chat": "@cf/openai/gpt-oss-120b",
	"completion": "@cf/openai/gpt-oss-120b",
	"embeddings": "@cf/baai/bge-base-en-v1.5",
	"audio_stt": "@cf/openai/whisper-large-v3-turbo",
	"audio_tts": "@cf/myshell-ai/melotts",
	"audio_translation": "@cf/meta/m2m100-1.2b",
	"image_generation": "@cf/black-forest-labs/flux-1-schnell",
	"vision": "@cf/llava-hf/llava-1.5-7b-hf",
	"classification": "@cf/huggingface/distilbert-sst-2-int8",
	"rag": "@cf/baai/bge-base-en-v1.5",
	"decision": "@cf/cloudflare/clef"
};

/**
 * Resolve a requested model name to a Cloudflare model path.
 * Handles OpenAI alias mapping, direct Cloudflare model names, and env-based overrides.
 * The result always belongs to the given category.
 * @param {string} category - The model category key from MODEL_CATEGORIES (e.g. 'chat', 'completion')
 * @param {string|undefined} requestedModel - The model name from the request
 * @param {Object} [envMapper={}] - Optional env.MODEL_MAPPER for backward-compatible overrides
 * @returns {string} The resolved Cloudflare model path
 * @throws {ValidationError} If the model is not supported by the category
 */
export const resolveModel = (category, requestedModel, envMapper = {}) => {
	const supportedModels = MODEL_CATEGORIES[category];
	if (!supportedModels) {
		throw new Error(`Unknown model category: ${category}`);
	}

	// No model specified — use default
	if (!requestedModel) {
		return DEFAULT_MODELS[category];
	}

	// OpenAI alias: only valid when its target belongs to this category
	if (Object.hasOwn(MODEL_MAPPING, requestedModel)) {
		const target = MODEL_MAPPING[requestedModel];
		if (supportedModels.includes(target)) {
			return target;
		}
		throw new ValidationError(
			`Model ${requestedModel} (${target}) is not supported by the ${category} category`,
			'model',
		);
	}

	// Direct Cloudflare model name
	if (supportedModels.includes(requestedModel)) {
		return requestedModel;
	}

	// Env-based mapper fallback (used by completion handler for backward compat)
	if (envMapper && Object.hasOwn(envMapper, requestedModel)) {
		const mapped = envMapper[requestedModel];
		if (supportedModels.includes(mapped)) {
			return mapped;
		}
	}

	if (MODEL_CATEGORIES.decision?.includes(requestedModel)) {
		throw new ValidationError(
			`${requestedModel} is a decision model and does not generate text. Use POST /v1/systemone instead.`,
			'model',
		);
	}
	throw new ValidationError(
		`Unsupported model: ${requestedModel}. Supported models: ${supportedModels.join(', ')}`,
		'model',
	);
};
