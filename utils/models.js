// Unified models configuration for Cloudflare Workers AI
// This file contains all supported models organized by category with context windows
//
// Auto-generated on: 2026-01-19T09:43:16.228Z
// To update: npm run update-models

// === CONTEXT WINDOW MAPPING ===
export const MODEL_CONTEXT_WINDOWS = {
	"@cf/pipecat-ai/smart-turn-v2": 4096,
	"@cf/openai/gpt-oss-120b": 4096,
	"@cf/qwen/qwen1.5-0.5b-chat": 4096,
	"@cf/baai/bge-m3": 8192,
	"@cf/huggingface/distilbert-sst-2-int8": 4096,
	"@cf/google/gemma-2b-it-lora": 8192,
	"@hf/nexusflow/starling-lm-7b-beta": 4096,
	"@cf/meta/llama-3-8b-instruct": 8192,
	"@cf/meta/llama-3.2-3b-instruct": 128000,
	"@hf/thebloke/neural-chat-7b-v3-1-awq": 4096,
	"@cf/meta/llama-guard-3-8b": 4096,
	"@cf/qwen/qwen3-embedding-0.6b": 4096,
	"@cf/meta/llama-2-7b-chat-fp16": 4096,
	"@cf/mistral/mistral-7b-instruct-v0.1": 8192,
	"@cf/myshell-ai/melotts": 4096,
	"@cf/mistral/mistral-7b-instruct-v0.2-lora": 32768,
	"@cf/deepgram/aura-2-es": 4096,
	"@cf/openai/whisper": 30,
	"@cf/tinyllama/tinyllama-1.1b-chat-v1.0": 4096,
	"@cf/pfnet/plamo-embedding-1b": 4096,
	"@hf/mistral/mistral-7b-instruct-v0.2": 4096,
	"@cf/fblgit/una-cybertron-7b-v2-bf16": 4096,
	"@cf/llava-hf/llava-1.5-7b-hf": 4096,
	"@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": 4096,
	"@cf/runwayml/stable-diffusion-v1-5-inpainting": 4096,
	"@cf/deepgram/flux": 4096,
	"@cf/deepgram/nova-3": 4096,
	"@cf/black-forest-labs/flux-1-schnell": 77,
	"@cf/thebloke/discolm-german-7b-v1-awq": 4096,
	"@cf/meta/llama-2-7b-chat-int8": 4096,
	"@cf/meta/llama-3.1-8b-instruct-fp8": 128000,
	"@hf/thebloke/mistral-7b-instruct-v0.1-awq": 4096,
	"@cf/qwen/qwen1.5-7b-chat-awq": 4096,
	"@cf/meta/llama-3.2-1b-instruct": 60000,
	"@hf/thebloke/llama-2-13b-chat-awq": 4096,
	"@cf/microsoft/resnet-50": 4096,
	"@cf/bytedance/stable-diffusion-xl-lightning": 77,
	"@hf/thebloke/deepseek-coder-6.7b-base-awq": 4096,
	"@cf/meta-llama/llama-2-7b-chat-hf-lora": 4096,
	"@cf/meta/llama-3.3-70b-instruct-fp8-fast": 24000,
	"@cf/ibm-granite/granite-4.0-h-micro": 4096,
	"@cf/lykon/dreamshaper-8-lcm": 4096,
	"@cf/leonardo/phoenix-1.0": 4096,
	"@cf/stabilityai/stable-diffusion-xl-base-1.0": 4096,
	"@hf/thebloke/openhermes-2.5-mistral-7b-awq": 4096,
	"@cf/meta/m2m100-1.2b": 4096,
	"@cf/ai4bharat/indictrans2-en-indic-1B": 4096,
	"@hf/thebloke/deepseek-coder-6.7b-instruct-awq": 4096,
	"@cf/black-forest-labs/flux-2-klein-4b": 4096,
	"@cf/baai/bge-small-en-v1.5": 512,
	"@cf/qwen/qwen2.5-coder-32b-instruct": 32768,
	"@cf/deepseek-ai/deepseek-math-7b-instruct": 4096,
	"@cf/tiiuae/falcon-7b-instruct": 4096,
	"@hf/nousresearch/hermes-2-pro-mistral-7b": 4096,
	"@cf/baai/bge-base-en-v1.5": 512,
	"@cf/aisingapore/gemma-sea-lion-v4-27b-it": 4096,
	"@cf/qwen/qwen3-30b-a3b-fp8": 4096,
	"@cf/meta/llama-3.1-8b-instruct-awq": 128000,
	"@cf/unum/uform-gen2-qwen-500m": 4096,
	"@cf/black-forest-labs/flux-2-dev": 4096,
	"@hf/thebloke/zephyr-7b-beta-awq": 4096,
	"@cf/google/gemma-7b-it-lora": 8192,
	"@cf/qwen/qwen1.5-1.8b-chat": 4096,
	"@cf/mistralai/mistral-small-3.1-24b-instruct": 128000,
	"@cf/meta/llama-3-8b-instruct-awq": 8192,
	"@cf/meta/llama-3.2-11b-vision-instruct": 128000,
	"@cf/openai/whisper-tiny-en": 30,
	"@cf/openai/whisper-large-v3-turbo": 30,
	"@cf/deepgram/aura-1": 4096,
	"@cf/defog/sqlcoder-7b-2": 4096,
	"@cf/microsoft/phi-2": 4096,
	"@cf/facebook/bart-large-cnn": 4096,
	"@cf/runwayml/stable-diffusion-v1-5-img2img": 4096,
	"@cf/openai/gpt-oss-20b": 4096,
	"@cf/google/embeddinggemma-300m": 4096,
	"@cf/baai/bge-reranker-base": 4096,
	"@hf/google/gemma-7b-it": 4096,
	"@cf/leonardo/lucid-origin": 4096,
	"@cf/qwen/qwen1.5-14b-chat-awq": 4096,
	"@cf/openchat/openchat-3.5-0106": 4096,
	"@cf/meta/llama-4-scout-17b-16e-instruct": 131072,
	"@cf/google/gemma-3-12b-it": 128000,
	"@cf/qwen/qwq-32b": 32768,
	"@cf/baai/bge-large-en-v1.5": 512,
	"@cf/deepgram/aura-2-en": 4096
};

// === ORIGINAL MODEL CATEGORIES ===
export const MODEL_CATEGORIES = {
	"chat": [
		"@cf/openai/gpt-oss-120b",
		"@cf/qwen/qwen1.5-0.5b-chat",
		"@cf/google/gemma-2b-it-lora",
		"@hf/nexusflow/starling-lm-7b-beta",
		"@cf/meta/llama-3-8b-instruct",
		"@cf/meta/llama-3.2-3b-instruct",
		"@hf/thebloke/neural-chat-7b-v3-1-awq",
		"@cf/meta/llama-guard-3-8b",
		"@cf/meta/llama-2-7b-chat-fp16",
		"@cf/mistral/mistral-7b-instruct-v0.1",
		"@cf/mistral/mistral-7b-instruct-v0.2-lora",
		"@cf/tinyllama/tinyllama-1.1b-chat-v1.0",
		"@hf/mistral/mistral-7b-instruct-v0.2",
		"@cf/fblgit/una-cybertron-7b-v2-bf16",
		"@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
		"@cf/thebloke/discolm-german-7b-v1-awq",
		"@cf/meta/llama-2-7b-chat-int8",
		"@cf/meta/llama-3.1-8b-instruct-fp8",
		"@hf/thebloke/mistral-7b-instruct-v0.1-awq",
		"@cf/qwen/qwen1.5-7b-chat-awq",
		"@cf/meta/llama-3.2-1b-instruct",
		"@hf/thebloke/llama-2-13b-chat-awq",
		"@hf/thebloke/deepseek-coder-6.7b-base-awq",
		"@cf/meta-llama/llama-2-7b-chat-hf-lora",
		"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		"@cf/ibm-granite/granite-4.0-h-micro",
		"@hf/thebloke/openhermes-2.5-mistral-7b-awq",
		"@hf/thebloke/deepseek-coder-6.7b-instruct-awq",
		"@cf/qwen/qwen2.5-coder-32b-instruct",
		"@cf/deepseek-ai/deepseek-math-7b-instruct",
		"@cf/tiiuae/falcon-7b-instruct",
		"@hf/nousresearch/hermes-2-pro-mistral-7b",
		"@cf/aisingapore/gemma-sea-lion-v4-27b-it",
		"@cf/qwen/qwen3-30b-a3b-fp8",
		"@cf/meta/llama-3.1-8b-instruct-awq",
		"@hf/thebloke/zephyr-7b-beta-awq",
		"@cf/google/gemma-7b-it-lora",
		"@cf/qwen/qwen1.5-1.8b-chat",
		"@cf/mistralai/mistral-small-3.1-24b-instruct",
		"@cf/meta/llama-3-8b-instruct-awq",
		"@cf/meta/llama-3.2-11b-vision-instruct",
		"@cf/defog/sqlcoder-7b-2",
		"@cf/microsoft/phi-2",
		"@cf/facebook/bart-large-cnn",
		"@cf/openai/gpt-oss-20b",
		"@hf/google/gemma-7b-it",
		"@cf/qwen/qwen1.5-14b-chat-awq",
		"@cf/openchat/openchat-3.5-0106",
		"@cf/meta/llama-4-scout-17b-16e-instruct",
		"@cf/google/gemma-3-12b-it",
		"@cf/qwen/qwq-32b"
	],
	"completion": [
		"@cf/openai/gpt-oss-120b",
		"@cf/qwen/qwen1.5-0.5b-chat",
		"@cf/google/gemma-2b-it-lora",
		"@hf/nexusflow/starling-lm-7b-beta",
		"@cf/meta/llama-3-8b-instruct",
		"@cf/meta/llama-3.2-3b-instruct",
		"@hf/thebloke/neural-chat-7b-v3-1-awq",
		"@cf/meta/llama-guard-3-8b",
		"@cf/meta/llama-2-7b-chat-fp16",
		"@cf/mistral/mistral-7b-instruct-v0.1",
		"@cf/mistral/mistral-7b-instruct-v0.2-lora",
		"@cf/tinyllama/tinyllama-1.1b-chat-v1.0",
		"@hf/mistral/mistral-7b-instruct-v0.2",
		"@cf/fblgit/una-cybertron-7b-v2-bf16",
		"@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
		"@cf/thebloke/discolm-german-7b-v1-awq",
		"@cf/meta/llama-2-7b-chat-int8",
		"@cf/meta/llama-3.1-8b-instruct-fp8",
		"@hf/thebloke/mistral-7b-instruct-v0.1-awq",
		"@cf/qwen/qwen1.5-7b-chat-awq",
		"@cf/meta/llama-3.2-1b-instruct",
		"@hf/thebloke/llama-2-13b-chat-awq",
		"@hf/thebloke/deepseek-coder-6.7b-base-awq",
		"@cf/meta-llama/llama-2-7b-chat-hf-lora",
		"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		"@cf/ibm-granite/granite-4.0-h-micro",
		"@hf/thebloke/openhermes-2.5-mistral-7b-awq",
		"@hf/thebloke/deepseek-coder-6.7b-instruct-awq",
		"@cf/qwen/qwen2.5-coder-32b-instruct",
		"@cf/deepseek-ai/deepseek-math-7b-instruct",
		"@cf/tiiuae/falcon-7b-instruct",
		"@hf/nousresearch/hermes-2-pro-mistral-7b",
		"@cf/aisingapore/gemma-sea-lion-v4-27b-it",
		"@cf/qwen/qwen3-30b-a3b-fp8",
		"@cf/meta/llama-3.1-8b-instruct-awq",
		"@hf/thebloke/zephyr-7b-beta-awq",
		"@cf/google/gemma-7b-it-lora",
		"@cf/qwen/qwen1.5-1.8b-chat",
		"@cf/mistralai/mistral-small-3.1-24b-instruct",
		"@cf/meta/llama-3-8b-instruct-awq",
		"@cf/meta/llama-3.2-11b-vision-instruct",
		"@cf/defog/sqlcoder-7b-2",
		"@cf/microsoft/phi-2",
		"@cf/facebook/bart-large-cnn",
		"@cf/openai/gpt-oss-20b",
		"@hf/google/gemma-7b-it",
		"@cf/qwen/qwen1.5-14b-chat-awq",
		"@cf/openchat/openchat-3.5-0106",
		"@cf/meta/llama-4-scout-17b-16e-instruct",
		"@cf/google/gemma-3-12b-it",
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
		"@cf/deepgram/flux",
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
		"@cf/runwayml/stable-diffusion-v1-5-inpainting",
		"@cf/black-forest-labs/flux-1-schnell",
		"@cf/bytedance/stable-diffusion-xl-lightning",
		"@cf/lykon/dreamshaper-8-lcm",
		"@cf/leonardo/phoenix-1.0",
		"@cf/stabilityai/stable-diffusion-xl-base-1.0",
		"@cf/black-forest-labs/flux-2-klein-4b",
		"@cf/black-forest-labs/flux-2-dev",
		"@cf/runwayml/stable-diffusion-v1-5-img2img",
		"@cf/leonardo/lucid-origin"
	],
	"vision": [
		"@cf/llava-hf/llava-1.5-7b-hf",
		"@cf/unum/uform-gen2-qwen-500m"
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
	]
};

// OpenAI-compatible model name mappings - using most powerful available models
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

// Reverse mapping for API responses
export const REVERSE_MODEL_MAPPING = Object.fromEntries(
	Object.entries(MODEL_MAPPING).map(([openai, cf]) => [cf, openai])
);

// Model capabilities
export const MODEL_CAPABILITIES = {
	"@cf/openai/gpt-oss-120b": [
		"text-generation"
	],
	"@cf/qwen/qwen1.5-0.5b-chat": [
		"text-generation"
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
	"@hf/nexusflow/starling-lm-7b-beta": [
		"text-generation"
	],
	"@cf/meta/llama-3-8b-instruct": [
		"text-generation"
	],
	"@cf/meta/llama-3.2-3b-instruct": [
		"text-generation"
	],
	"@hf/thebloke/neural-chat-7b-v3-1-awq": [
		"text-generation"
	],
	"@cf/meta/llama-guard-3-8b": [
		"text-generation"
	],
	"@cf/qwen/qwen3-embedding-0.6b": [
		"embeddings"
	],
	"@cf/meta/llama-2-7b-chat-fp16": [
		"text-generation"
	],
	"@cf/mistral/mistral-7b-instruct-v0.1": [
		"text-generation"
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
	"@cf/openai/whisper": [
		"speech-to-text"
	],
	"@cf/tinyllama/tinyllama-1.1b-chat-v1.0": [
		"text-generation"
	],
	"@cf/pfnet/plamo-embedding-1b": [
		"embeddings"
	],
	"@hf/mistral/mistral-7b-instruct-v0.2": [
		"text-generation"
	],
	"@cf/fblgit/una-cybertron-7b-v2-bf16": [
		"text-generation"
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
	"@cf/thebloke/discolm-german-7b-v1-awq": [
		"text-generation"
	],
	"@cf/meta/llama-2-7b-chat-int8": [
		"text-generation"
	],
	"@cf/meta/llama-3.1-8b-instruct-fp8": [
		"text-generation"
	],
	"@hf/thebloke/mistral-7b-instruct-v0.1-awq": [
		"text-generation"
	],
	"@cf/qwen/qwen1.5-7b-chat-awq": [
		"text-generation"
	],
	"@cf/meta/llama-3.2-1b-instruct": [
		"text-generation"
	],
	"@hf/thebloke/llama-2-13b-chat-awq": [
		"text-generation"
	],
	"@cf/microsoft/resnet-50": [
		"image-classification"
	],
	"@cf/bytedance/stable-diffusion-xl-lightning": [
		"image-generation"
	],
	"@hf/thebloke/deepseek-coder-6.7b-base-awq": [
		"text-generation"
	],
	"@cf/meta-llama/llama-2-7b-chat-hf-lora": [
		"text-generation"
	],
	"@cf/meta/llama-3.3-70b-instruct-fp8-fast": [
		"text-generation"
	],
	"@cf/ibm-granite/granite-4.0-h-micro": [
		"text-generation"
	],
	"@cf/lykon/dreamshaper-8-lcm": [
		"image-generation"
	],
	"@cf/leonardo/phoenix-1.0": [
		"image-generation"
	],
	"@cf/stabilityai/stable-diffusion-xl-base-1.0": [
		"image-generation"
	],
	"@hf/thebloke/openhermes-2.5-mistral-7b-awq": [
		"text-generation"
	],
	"@cf/meta/m2m100-1.2b": [
		"translation"
	],
	"@cf/ai4bharat/indictrans2-en-indic-1B": [
		"translation"
	],
	"@hf/thebloke/deepseek-coder-6.7b-instruct-awq": [
		"text-generation"
	],
	"@cf/black-forest-labs/flux-2-klein-4b": [
		"image-generation"
	],
	"@cf/baai/bge-small-en-v1.5": [
		"embeddings"
	],
	"@cf/qwen/qwen2.5-coder-32b-instruct": [
		"text-generation"
	],
	"@cf/deepseek-ai/deepseek-math-7b-instruct": [
		"text-generation"
	],
	"@cf/tiiuae/falcon-7b-instruct": [
		"text-generation"
	],
	"@hf/nousresearch/hermes-2-pro-mistral-7b": [
		"text-generation"
	],
	"@cf/baai/bge-base-en-v1.5": [
		"embeddings"
	],
	"@cf/aisingapore/gemma-sea-lion-v4-27b-it": [
		"text-generation"
	],
	"@cf/qwen/qwen3-30b-a3b-fp8": [
		"text-generation"
	],
	"@cf/meta/llama-3.1-8b-instruct-awq": [
		"text-generation"
	],
	"@cf/unum/uform-gen2-qwen-500m": [
		"vision"
	],
	"@cf/black-forest-labs/flux-2-dev": [
		"image-generation"
	],
	"@hf/thebloke/zephyr-7b-beta-awq": [
		"text-generation"
	],
	"@cf/google/gemma-7b-it-lora": [
		"text-generation"
	],
	"@cf/qwen/qwen1.5-1.8b-chat": [
		"text-generation"
	],
	"@cf/mistralai/mistral-small-3.1-24b-instruct": [
		"text-generation"
	],
	"@cf/meta/llama-3-8b-instruct-awq": [
		"text-generation"
	],
	"@cf/meta/llama-3.2-11b-vision-instruct": [
		"text-generation"
	],
	"@cf/openai/whisper-tiny-en": [
		"speech-to-text"
	],
	"@cf/openai/whisper-large-v3-turbo": [
		"speech-to-text"
	],
	"@cf/deepgram/aura-1": [
		"text-to-speech"
	],
	"@cf/defog/sqlcoder-7b-2": [
		"text-generation"
	],
	"@cf/microsoft/phi-2": [
		"text-generation"
	],
	"@cf/facebook/bart-large-cnn": [
		"summarization"
	],
	"@cf/runwayml/stable-diffusion-v1-5-img2img": [
		"image-generation"
	],
	"@cf/openai/gpt-oss-20b": [
		"text-generation"
	],
	"@cf/google/embeddinggemma-300m": [
		"embeddings"
	],
	"@cf/baai/bge-reranker-base": [
		"text-classification"
	],
	"@hf/google/gemma-7b-it": [
		"text-generation"
	],
	"@cf/leonardo/lucid-origin": [
		"image-generation"
	],
	"@cf/qwen/qwen1.5-14b-chat-awq": [
		"text-generation"
	],
	"@cf/openchat/openchat-3.5-0106": [
		"text-generation"
	],
	"@cf/meta/llama-4-scout-17b-16e-instruct": [
		"text-generation"
	],
	"@cf/google/gemma-3-12b-it": [
		"text-generation"
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

// Default models for each category - prioritizing most modern and powerful models
export const DEFAULT_MODELS = {
	"chat": "@cf/openai/gpt-oss-120b",
	"completion": "@cf/openai/gpt-oss-120b",
	"embeddings": "@cf/baai/bge-m3",
	"audio_stt": "@cf/openai/whisper",
	"audio_tts": "@cf/myshell-ai/melotts",
	"audio_translation": "@cf/meta/m2m100-1.2b",
	"image_generation": "@cf/runwayml/stable-diffusion-v1-5-inpainting",
	"vision": "@cf/llava-hf/llava-1.5-7b-hf",
	"classification": "@cf/huggingface/distilbert-sst-2-int8",
	"rag": "@cf/baai/bge-m3"
};

// === INTEGRATED HELPER FUNCTIONS ===

// Helper function to get all models
export const getAllModels = () => {
	const allModels = new Set();
	Object.values(MODEL_CATEGORIES).forEach(category => {
		category.forEach(model => allModels.add(model));
	});
	return Array.from(allModels).sort();
};

// Helper function to get models by capability
export const getModelsByCapability = capability => {
	return Object.entries(MODEL_CAPABILITIES)
		.filter(([_model, capabilities]) => capabilities.includes(capability))
		.map(([_model]) => _model);
};

// Helper function to check if model exists
export const isValidModel = modelName => {
	return Object.keys(MODEL_CAPABILITIES).includes(modelName);
};

// **UPDATED: Context window function using the mapping**
export const getModelContextWindow = modelName => {
	const contextWindow = MODEL_CONTEXT_WINDOWS[modelName];
	if (!contextWindow) {
		console.warn(`Context window not found for model: ${modelName}. Using default 4096.`);
		return 4096; // Default fallback
	}
	return contextWindow;
};

// Helper function to validate if a model has context window info
export const isModelSupported = modelName => {
	return modelName in MODEL_CONTEXT_WINDOWS;
};

// Helper function to calculate a sensible max_tokens default for a model
export const calculateDefaultMaxTokens = (modelName, reservePercentage = 10) => {
	const contextWindow = getModelContextWindow(modelName);
	// Reserve a percentage of the context window for the prompt and safety buffer
	const reserveTokens = Math.floor(contextWindow * (reservePercentage / 100));
	// Return a reasonable default max_tokens value (at least 100 tokens, no more than 90% of context)
	const maxTokens = Math.max(100, contextWindow - reserveTokens);
	return maxTokens > 0 ? maxTokens : 1024; // Ensure we always return a positive number
};

// Helper function to get all models with context windows above a threshold
export const getModelsWithContextAbove = threshold => {
	return Object.entries(MODEL_CONTEXT_WINDOWS)
		.filter(([_model, contextWindow]) => contextWindow >= threshold)
		.map(([_model]) => _model);
};

// Helper function to get models grouped by context window size
export const getModelsByContextWindow = () => {
	const grouped = {};
	Object.entries(MODEL_CONTEXT_WINDOWS).forEach(([model, contextWindow]) => {
		if (!grouped[contextWindow]) {
			grouped[contextWindow] = [];
		}
		grouped[contextWindow].push(model);
	});
	return grouped;
};

// Context window statistics
export const getContextWindowStats = () => {
	const windows = Object.values(MODEL_CONTEXT_WINDOWS);
	return {
		total_models: windows.length,
		min_context: Math.min(...windows),
		max_context: Math.max(...windows),
		average_context: Math.round(windows.reduce((a, b) => a + b, 0) / windows.length),
		models_with_128k_plus: windows.filter(w => w >= 128000).length,
		models_with_32k_plus: windows.filter(w => w >= 32768).length,
		models_with_8k_plus: windows.filter(w => w >= 8192).length,
		models_with_large_context: getModelsWithContextAbove(128000),
		models_with_medium_context: getModelsWithContextAbove(32768).filter(m => MODEL_CONTEXT_WINDOWS[m] < 128000),
	};
};

// Helper to get optimal model for context size requirement
export const getOptimalModelForContext = (requiredContext, category = 'chat', capabilities = []) => {
	const categoryModels = MODEL_CATEGORIES[category] || [];

	const suitableModels = categoryModels.filter(model => {
		const contextWindow = MODEL_CONTEXT_WINDOWS[model];
		const modelCapabilities = MODEL_CAPABILITIES[model] || [];

		// Check context window requirement
		if (contextWindow < requiredContext) return false;

		// Check capability requirements
		if (capabilities.length > 0) {
			return capabilities.some(cap => modelCapabilities.includes(cap));
		}

		return true;
	});

	// Sort by context window (smallest that meets requirements first for efficiency)
	return suitableModels.sort((a, b) => MODEL_CONTEXT_WINDOWS[a] - MODEL_CONTEXT_WINDOWS[b]);
};

// Model recommendation based on use case
export const getModelRecommendation = useCase => {
	const recommendations = {
		'long-context': getModelsWithContextAbove(128000),
		'coding': getModelsByCapability('code-generation'),
		'vision': getModelsByCapability('vision'),
		'reasoning': getModelsByCapability('reasoning'),
		'multilingual': ['@cf/baai/bge-m3', '@cf/meta/llama-3.2-11b-vision-instruct'],
		'fast-inference': [
			'@cf/meta/llama-3.2-1b-instruct',
			'@cf/tinyllama/tinyllama-1.1b-chat-v1.0',
			'@cf/qwen/qwen1.5-0.5b-chat',
		],
		'balanced': ['@cf/meta/llama-3.1-8b-instruct-fp8', '@cf/meta/llama-3-8b-instruct', '@cf/google/gemma-7b-it'],
	};

	return recommendations[useCase] || [];
};
