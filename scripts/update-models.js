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

// Manual context window overrides, only where the catalog is missing or reports something other than the
// model's token limit. Text-generation windows come from the catalog `context_window` property.
const CONTEXT_WINDOW_OVERRIDES = {
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

// Preferred default model per category (first entry of the category is used only if this is absent)
const PREFERRED_DEFAULTS = {
	chat: '@cf/openai/gpt-oss-120b',
	completion: '@cf/openai/gpt-oss-120b',
	image_generation: '@cf/black-forest-labs/flux-1-schnell',
	audio_stt: '@cf/openai/whisper-large-v3-turbo',
	audio_tts: '@cf/myshell-ai/melotts',
	embeddings: '@cf/baai/bge-base-en-v1.5',
	rag: '@cf/baai/bge-base-en-v1.5',
	decision: '@cf/cloudflare/clef',
};

// Models filed under a task whose input the gateway handlers cannot serve for that category
const CATEGORY_EXCLUSIONS = {
	// Safety classifier: requires strict user/assistant role alternation, not a general chat model
	chat: new Set(['@cf/meta/llama-guard-3-8b']),
	completion: new Set(['@cf/meta/llama-guard-3-8b']),
	// Needs an input image + mask
	image_generation: new Set(['@cf/runwayml/stable-diffusion-v1-5-inpainting']),
	// WebSocket-only streaming model
	audio_stt: new Set(['@cf/deepgram/flux']),
};

// Decision models (System One API: `state` + typed `questions` in, probabilities out).
// Cloudflare files them under "Text Generation", but they cannot serve chat/completions.
const DECISION_MODEL_PREFIX = '@cf/cloudflare/clef';

function isDecisionModel(model) {
	return model.name.startsWith(DECISION_MODEL_PREFIX);
}

/**
 * Fetch models from Cloudflare Workers AI using wrangler CLI
 */
async function fetchCloudflareModels() {
	try {
		// Use wrangler to fetch models (uses the wrangler login session)
		const output = execSync('npx wrangler ai models list --json', {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		const models = JSON.parse(output);
		console.log(`✓ Fetched ${models.length} models from Cloudflare`);
		return models;
	} catch {
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

	const url = `${API_BASE}/accounts/${accountId}/ai/models/search?per_page=1000&hide_experimental=false`;

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
 * Look up a catalog property value. Catalog `properties` is an array of { property_id, value }.
 */
export function prop(model, id) {
	if (!Array.isArray(model.properties)) return undefined;
	return model.properties.find(p => p.property_id === id)?.value;
}

function isTrue(value) {
	return value === true || value === 'true';
}

/**
 * A model is deprecated when flagged so or when its planned deprecation date has passed.
 */
function isDeprecated(model, now = Date.now()) {
	if (model.deprecated === true) return true;
	const planned = prop(model, 'planned_deprecation_date') ?? model.planned_deprecation_date;
	if (planned) {
		const ts = Date.parse(planned);
		if (!Number.isNaN(ts) && ts < now) return true;
	}
	return false;
}

/**
 * Determine context window for a model: manual override, then catalog `context_window`, then default.
 */
function getContextWindow(model) {
	if (CONTEXT_WINDOW_OVERRIDES[model.name]) {
		return CONTEXT_WINDOW_OVERRIDES[model.name];
	}
	const fromCatalog = Number(prop(model, 'context_window'));
	if (Number.isFinite(fromCatalog) && fromCatalog > 0) {
		return fromCatalog;
	}
	return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Get capabilities for a model based on its task and catalog properties
 */
function getCapabilities(model) {
	if (isDecisionModel(model)) return ['decision'];
	const task = model.task?.name || 'Unknown';
	const caps = [...(TASK_TO_CAPABILITY_MAP[task] || [])];
	if (isTrue(prop(model, 'function_calling'))) caps.push('function-calling');
	if (isTrue(prop(model, 'vision')) && !caps.includes('vision')) caps.push('vision');
	return caps;
}

/**
 * Get categories for a model based on its task
 */
function getCategories(model) {
	if (isDecisionModel(model)) return ['decision'];
	const task = model.task?.name || 'Unknown';
	const cats = TASK_TO_CATEGORY_MAP[task] || [];
	return cats.filter(cat => !CATEGORY_EXCLUSIONS[cat]?.has(model.name));
}

/**
 * Process models and organize them into categories
 */
export function processModels(models, now = Date.now()) {
	const modelContextWindows = {};
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
		decision: [],
	};

	for (const model of models) {
		const modelId = model.name;

		if (isDeprecated(model, now)) {
			continue;
		}

		modelContextWindows[modelId] = getContextWindow(model);

		const capabilities = getCapabilities(model);
		if (capabilities.length > 0) {
			modelCapabilities[modelId] = capabilities;
		}

		for (const cat of getCategories(model)) {
			if (categories[cat] && !categories[cat].includes(modelId)) {
				categories[cat].push(modelId);
			}
		}
	}

	// RAG uses the embedding models
	categories.rag = [...categories.embeddings];

	// Filter out empty categories
	const nonEmptyCategories = {};
	for (const [key, value] of Object.entries(categories)) {
		if (value.length > 0) {
			nonEmptyCategories[key] = value;
		}
	}

	// Preferred default per category; fall back to the first model only when the preferred one is absent
	const defaultModels = {};
	for (const [cat, list] of Object.entries(nonEmptyCategories)) {
		const preferred = PREFERRED_DEFAULTS[cat];
		defaultModels[cat] = preferred && list.includes(preferred) ? preferred : list[0];
	}

	return {
		modelContextWindows,
		modelCategories: nonEmptyCategories,
		modelCapabilities,
		defaultModels,
	};
}

/**
 * Generate the models.js file content
 */
export function generateModelsFile(processedData) {
	const { modelContextWindows, modelCategories, modelCapabilities, defaultModels } = processedData;

	const timestamp = new Date().toISOString();

	return `// Unified models configuration for Cloudflare Workers AI
// This file contains all supported models organized by category with context windows
//
// Auto-generated on: ${timestamp}
// To update: npm run update-models

import { ValidationError } from './errors.js';

// === CONTEXT WINDOW MAPPING ===
export const MODEL_CONTEXT_WINDOWS = ${JSON.stringify(modelContextWindows, null, '\t')};

// === ORIGINAL MODEL CATEGORIES ===
export const MODEL_CATEGORIES = ${JSON.stringify(modelCategories, null, '\t')};

// OpenAI-compatible model name mappings. An alias only resolves inside a category that contains its target.
export const MODEL_MAPPING = ${JSON.stringify(OPENAI_MODEL_MAPPINGS, null, '\t')};

// Model capabilities
export const MODEL_CAPABILITIES = ${JSON.stringify(modelCapabilities, null, '\t')};

// Default model for each category (preferred model when present in the catalog, else the first entry)
export const DEFAULT_MODELS = ${JSON.stringify(defaultModels, null, '\t')};

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
		throw new Error(\`Unknown model category: \${category}\`);
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
			\`Model \${requestedModel} (\${target}) is not supported by the \${category} category\`,
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
			\`\${requestedModel} is a decision model and does not generate text. Use POST /v1/systemone instead.\`,
			'model',
		);
	}
	throw new ValidationError(
		\`Unsupported model: \${requestedModel}. Supported models: \${supportedModels.join(', ')}\`,
		'model',
	);
};
`;
}

/**
 * Sanity checks on a processed catalog. Throws when the result would produce a broken gateway.
 */
export function validateProcessedModels(processedData) {
	const { modelContextWindows, modelCategories, modelCapabilities } = processedData;

	if (!modelCategories.chat || modelCategories.chat.length === 0) {
		throw new Error('Catalog sanity check failed: the chat category is empty');
	}

	const missing = Object.entries(OPENAI_MODEL_MAPPINGS)
		.filter(([, target]) => !(target in modelContextWindows))
		.map(([alias, target]) => `${alias} -> ${target}`);
	if (missing.length > 0) {
		throw new Error(`Catalog sanity check failed: MODEL_MAPPING targets missing from catalog:\n  ${missing.join('\n  ')}`);
	}

	if (!Object.values(modelCapabilities).some(caps => caps.includes('function-calling'))) {
		throw new Error("Catalog sanity check failed: no model has the 'function-calling' capability (catalog properties not parsed?)");
	}
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
		validateProcessedModels(processedData);

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

// Run only when executed directly (not when imported by tests)
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
	main();
}
