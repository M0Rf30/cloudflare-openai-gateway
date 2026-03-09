#!/usr/bin/env node

/**
 * Auto-update Cloudflare Workers AI models
 *
 * This script fetches the latest models from Cloudflare Workers AI API
 * and generates/updates the utils/models.js configuration file.
 *
 * Usage:
 *   node scripts/update-models.js [--dry-run]
 *
 * Environment variables required:
 *   CLOUDFLARE_ACCOUNT_ID - Your Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN - Your Cloudflare API token with Workers AI permissions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE = 'https://api.cloudflare.com/client/v4';
const MODELS_OUTPUT_PATH = path.join(__dirname, '..', 'utils', 'models.js');
const DRY_RUN = process.argv.includes('--dry-run');

// Default context window for models without specified limits
const DEFAULT_CONTEXT_WINDOW = 4096;

// Manual context window overrides (from empirical testing or documentation)
const CONTEXT_WINDOW_OVERRIDES = {
	'@cf/meta/llama-4-scout-17b-16e-instruct': 131072,
	'@cf/meta/llama-3.3-70b-instruct-fp8-fast': 24000,
	'@cf/meta/llama-3.1-70b-instruct': 128000,
	'@cf/meta/llama-3.1-8b-instruct': 128000,
	'@cf/meta/llama-3.1-8b-instruct-fast': 128000,
	'@cf/meta/llama-3.1-8b-instruct-fp8': 128000,
	'@cf/meta/llama-3.1-8b-instruct-awq': 128000,
	'@cf/meta/llama-3-8b-instruct': 8192,
	'@cf/meta/llama-3-8b-instruct-awq': 8192,
	'@cf/meta/llama-3.2-1b-instruct': 60000,
	'@cf/meta/llama-3.2-3b-instruct': 128000,
	'@cf/meta/llama-3.2-11b-vision-instruct': 128000,
	'@cf/mistralai/mistral-small-3.1-24b-instruct': 128000,
	'@cf/mistral/mistral-7b-instruct-v0.1': 8192,
	'@cf/mistral/mistral-7b-instruct-v0.2': 32768,
	'@cf/mistral/mistral-7b-instruct-v0.2-lora': 32768,
	'@cf/google/gemma-3-12b-it': 128000,
	'@cf/google/gemma-7b-it': 8192,
	'@cf/google/gemma-7b-it-lora': 8192,
	'@cf/google/gemma-2b-it-lora': 8192,
	'@cf/qwen/qwq-32b': 32768,
	'@cf/qwen/qwen2.5-coder-32b-instruct': 32768,
	'@cf/black-forest-labs/flux-1-schnell': 77,
	'@cf/bytedance/stable-diffusion-xl-lightning': 77,
	'@cf/openai/whisper-large-v3-turbo': 30,
	'@cf/openai/whisper-tiny-en': 30,
	'@cf/openai/whisper': 30,
	'@cf/baai/bge-base-en-v1.5': 512,
	'@cf/baai/bge-small-en-v1.5': 512,
	'@cf/baai/bge-large-en-v1.5': 512,
	'@cf/baai/bge-m3': 8192,
};

// OpenAI-compatible model mappings
const OPENAI_MODEL_MAPPINGS = {
	'gpt-3.5-turbo': '@cf/meta/llama-3.1-8b-instruct-fp8',
	'gpt-4': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
	'gpt-4o': '@cf/meta/llama-3.2-11b-vision-instruct',
	'gpt-4-turbo': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
	'gpt-3.5-turbo-16k': '@cf/qwen/qwq-32b',
	'gpt-4-32k': '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
	'gpt-4o-mini': '@cf/meta/llama-3.2-3b-instruct',
	'gpt-3.5-turbo-instruct': '@cf/qwen/qwen2.5-coder-32b-instruct',
	'text-embedding-ada-002': '@cf/baai/bge-base-en-v1.5',
	'text-embedding-3-small': '@cf/baai/bge-small-en-v1.5',
	'text-embedding-3-large': '@cf/baai/bge-large-en-v1.5',
	'whisper-1': '@cf/openai/whisper-large-v3-turbo',
	'whisper': '@cf/openai/whisper-large-v3-turbo',
	'whisper-tiny-en': '@cf/openai/whisper-tiny-en',
	'whisper-large-v3-turbo': '@cf/openai/whisper-large-v3-turbo',
	'tts-1': '@cf/myshell-ai/melotts',
	'tts-1-hd': '@cf/myshell-ai/melotts',
	'dall-e-2': '@cf/black-forest-labs/flux-1-schnell',
	'dall-e-3': '@cf/black-forest-labs/flux-1-schnell',
	'gpt-4-vision-preview': '@cf/meta/llama-3.2-11b-vision-instruct',
	'text-moderation-latest': '@cf/meta/llama-guard-3-8b',
	'text-moderation-stable': '@cf/meta/llama-guard-3-8b',
	'code-davinci-002': '@cf/qwen/qwen2.5-coder-32b-instruct',
	'rerank-001': '@cf/baai/bge-reranker-base',
};

// Capability mappings based on task types
const TASK_TO_CAPABILITY_MAP = {
	'Text Generation': ['text-generation'],
	'Text Embeddings': ['embeddings'],
	'Automatic Speech Recognition': ['speech-to-text'],
	'Text-to-Speech': ['text-to-speech'],
	'Translation': ['translation'],
	'Text-to-Image': ['image-generation'],
	'Image-to-Text': ['vision'],
	'Text Classification': ['text-classification'],
	'Summarization': ['summarization'],
	'Image Classification': ['image-classification'],
	'Object Detection': ['object-detection'],
	'Voice Activity Detection': ['voice-activity-detection'],
};

// Category mappings based on tasks
const TASK_TO_CATEGORY_MAP = {
	'Text Generation': ['chat', 'completion'],
	'Text Embeddings': ['embeddings'],
	'Automatic Speech Recognition': ['audio_stt'],
	'Text-to-Speech': ['audio_tts'],
	'Translation': ['audio_translation'],
	'Text-to-Image': ['image_generation'],
	'Image-to-Text': ['vision'],
	'Text Classification': ['classification'],
	'Summarization': ['chat', 'completion'],
	'Image Classification': ['classification'],
	'Object Detection': ['classification'],
	'Voice Activity Detection': ['audio_stt'],
};

/**
 * Fetch models from Cloudflare Workers AI using wrangler CLI
 */
async function fetchCloudflareModels() {
	try {
		// Use wrangler to fetch models (doesn't require API token for read operations)
		const output = execSync('npx wrangler ai models --json', {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		const models = JSON.parse(output);
		console.log(`✓ Fetched ${models.length} models from Cloudflare`);
		return models;
	} catch (error) {
		// If wrangler fails, try the API approach (requires credentials)
		return fetchCloudflareModelsViaAPI();
	}
}

/**
 * Fallback: Fetch models from Cloudflare Workers AI API
 */
async function fetchCloudflareModelsViaAPI() {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = process.env.CLOUDFLARE_API_TOKEN;

	if (!accountId || !apiToken) {
		throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables are required');
	}

	const url = `${API_BASE}/accounts/${accountId}/ai/models/catalog`;

	const response = await fetch(url, {
		headers: {
			'Authorization': `Bearer ${apiToken}`,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
	}

	const data = await response.json();

	if (!data.success) {
		throw new Error(`API returned error: ${JSON.stringify(data.errors)}`);
	}

	return data.result;
}

/**
 * Parse model ID to extract provider and model name
 */
function parseModelId(modelId) {
	const match = modelId.match(/@cf\/([^/]+)\/(.+)/);
	if (match) {
		return { provider: match[1], name: match[2] };
	}
	return { provider: 'unknown', name: modelId };
}

/**
 * Determine context window for a model
 */
function getContextWindow(model) {
	const modelId = model.name;

	// Check manual overrides first
	if (CONTEXT_WINDOW_OVERRIDES[modelId]) {
		return CONTEXT_WINDOW_OVERRIDES[modelId];
	}

	// Try to extract from model properties (if available)
	if (model.properties?.context_length) {
		return model.properties.context_length;
	}

	// Use default
	return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Get capabilities for a model based on its task
 */
function getCapabilities(model) {
	const task = model.task?.name || 'Unknown';
	return TASK_TO_CAPABILITY_MAP[task] || [];
}

/**
 * Get categories for a model based on its task
 */
function getCategories(model) {
	const task = model.task?.name || 'Unknown';
	return TASK_TO_CATEGORY_MAP[task] || [];
}

/**
 * Process models and organize them into categories
 */
function processModels(models) {
	const modelContextWindows = {};
	const modelCategories = {};
	const modelCapabilities = {};

	// Initialize category arrays
	const categories = {
		chat: [],
		completion: [],
		embeddings: [],
		audio_stt: [],
		audio_tts: [],
		audio_translation: [],
		audio_language_detection: [],
		image_generation: [],
		vision: [],
		classification: [],
		reranking: [],
		rag: [],
	};

	for (const model of models) {
		const modelId = model.name;

		// Skip deprecated or beta models marked as deprecated
		if (model.properties?.deprecated) {
			continue;
		}

		// Get context window
		modelContextWindows[modelId] = getContextWindow(model);

		// Get capabilities
		const capabilities = getCapabilities(model);
		if (capabilities.length > 0) {
			modelCapabilities[modelId] = capabilities;
		}

		// Get categories and add model to appropriate categories
		const modelCats = getCategories(model);
		for (const cat of modelCats) {
			if (categories[cat] && !categories[cat].includes(modelId)) {
				categories[cat].push(modelId);
			}
		}
	}

	// Special handling for RAG category (use embedding models)
	categories.rag = [...categories.embeddings];

	// Filter out empty categories to avoid test failures
	const nonEmptyCategories = {};
	for (const [key, value] of Object.entries(categories)) {
		if (value.length > 0) {
			nonEmptyCategories[key] = value;
		}
	}

	return {
		modelContextWindows,
		modelCategories: nonEmptyCategories,
		modelCapabilities,
	};
}

/**
 * Generate the models.js file content
 */
function generateModelsFile(processedData) {
	const { modelContextWindows, modelCategories, modelCapabilities } = processedData;

	const timestamp = new Date().toISOString();

	return `// Unified models configuration for Cloudflare Workers AI
// This file contains all supported models organized by category with context windows
//
// Auto-generated on: ${timestamp}
// To update: npm run update-models

// === CONTEXT WINDOW MAPPING ===
export const MODEL_CONTEXT_WINDOWS = ${JSON.stringify(modelContextWindows, null, '\t')};

// === ORIGINAL MODEL CATEGORIES ===
export const MODEL_CATEGORIES = ${JSON.stringify(modelCategories, null, '\t')};

// OpenAI-compatible model name mappings - using most powerful available models
export const MODEL_MAPPING = ${JSON.stringify(OPENAI_MODEL_MAPPINGS, null, '\t')};

// Reverse mapping for API responses
export const REVERSE_MODEL_MAPPING = Object.fromEntries(
	Object.entries(MODEL_MAPPING).map(([openai, cf]) => [cf, openai])
);

// Model capabilities
export const MODEL_CAPABILITIES = ${JSON.stringify(modelCapabilities, null, '\t')};

// Default models for each category - prioritizing most modern and powerful models
export const DEFAULT_MODELS = ${JSON.stringify(
		Object.fromEntries(Object.entries(modelCategories).map(([cat, models]) => [cat, models[0]])),
		null,
		'\t'
	)};

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
		console.warn(\`Context window not found for model: \${modelName}. Using default 4096.\`);
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

// === SHARED HELPERS FOR ROUTE HANDLERS ===

/**
 * Check if a model is an OpenAI OSS model requiring special parameter handling.
 * OSS models use 'input' instead of 'messages'/'prompt' and return a different response format.
 * @param {string} model - The Cloudflare model path
 * @returns {boolean}
 */
export const isOSSModel = (model) => {
	return model === '@cf/openai/gpt-oss-120b' || model === '@cf/openai/gpt-oss-20b';
};

/**
 * Resolve a requested model name to a Cloudflare model path.
 * Handles OpenAI model name mapping, direct Cloudflare model names, and env-based overrides.
 * @param {string} category - The model category key from MODEL_CATEGORIES (e.g. 'chat', 'completion')
 * @param {string|undefined} requestedModel - The model name from the request
 * @param {Object} [envMapper={}] - Optional env.MODEL_MAPPER for backward-compatible overrides
 * @returns {string} The resolved Cloudflare model path
 * @throws {Error} If the model is not supported
 */
export const resolveModel = (category, requestedModel, envMapper = {}) => {
	const supportedModels = MODEL_CATEGORIES[category];
	if (!supportedModels) {
		throw new Error(\`Unknown model category: \${category}\`);
	}

	// No model specified — use default
	if (!requestedModel) {
		return DEFAULT_MODELS[category];
	}

	// OpenAI model name mapping
	if (MODEL_MAPPING[requestedModel]) {
		return MODEL_MAPPING[requestedModel];
	}

	// Direct Cloudflare model name
	if (supportedModels.includes(requestedModel)) {
		return requestedModel;
	}

	// Env-based mapper fallback (used by completion handler for backward compat)
	if (envMapper && envMapper[requestedModel]) {
		const mapped = envMapper[requestedModel];
		if (supportedModels.includes(mapped)) {
			return mapped;
		}
	}

	throw new Error(\`Unsupported model: \${requestedModel}. Supported models: \${supportedModels.join(', ')}\`);
};
`;
}

/**
 * Main execution
 */
async function main() {
	try {
		console.log('🚀 Starting model update...\n');

		// Fetch models from API
		const models = await fetchCloudflareModels();

		// Process models
		const processedData = processModels(models);

		// Generate file content
		const fileContent = generateModelsFile(processedData);

		if (DRY_RUN) {
			console.log('\n⚠️  DRY RUN MODE - No files will be written\n');
			console.log('Generated file preview (first 1000 chars):');
			console.log(fileContent.substring(0, 1000));
			console.log('\n... (truncated)\n');
		} else {
			// Write to file
			fs.writeFileSync(MODELS_OUTPUT_PATH, fileContent, 'utf8');
			console.log(`✅ Successfully wrote models to: ${MODELS_OUTPUT_PATH}`);
		}

		// Print summary statistics
		console.log('📈 Summary:');
		console.log(`   Total models: ${Object.keys(processedData.modelContextWindows).length}`);
		console.log(`   Categories: ${Object.keys(processedData.modelCategories).length}`);
		console.log('\n✨ Model update complete!\n');
	} catch (error) {
		console.error('❌ Error updating models:', error.message);
		process.exit(1);
	}
}

// Run the script
main();
