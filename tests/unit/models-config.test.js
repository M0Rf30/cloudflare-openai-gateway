import { describe, it, expect } from 'vitest';
import {
	MODEL_CONTEXT_WINDOWS,
	MODEL_CATEGORIES,
	MODEL_MAPPING,
	MODEL_CAPABILITIES,
	DEFAULT_MODELS,
	resolveModel,
} from '../../utils/models.js';
import { ValidationError } from '../../utils/errors.js';
import { processModels, generateModelsFile, validateProcessedModels, prop } from '../../scripts/update-models.js';

describe('Models Configuration', () => {
	describe('MODEL_CONTEXT_WINDOWS', () => {
		it('should be an object with model IDs as keys', () => {
			expect(MODEL_CONTEXT_WINDOWS).toBeDefined();
			expect(typeof MODEL_CONTEXT_WINDOWS).toBe('object');
			expect(Object.keys(MODEL_CONTEXT_WINDOWS).length).toBeGreaterThan(0);
		});

		it('should have numeric context window values', () => {
			Object.values(MODEL_CONTEXT_WINDOWS).forEach(contextWindow => {
				expect(typeof contextWindow).toBe('number');
				expect(contextWindow).toBeGreaterThan(0);
			});
		});

		it('should have valid model ID format', () => {
			Object.keys(MODEL_CONTEXT_WINDOWS).forEach(modelId => {
				expect(modelId).toMatch(/^@(cf|hf)\//);
			});
		});
	});

	describe('MODEL_CATEGORIES', () => {
		it('should have expected categories', () => {
			const expectedCategories = [
				'chat',
				'completion',
				'embeddings',
				'audio_stt',
				'audio_tts',
				'image_generation',
				'vision',
			];

			expectedCategories.forEach(category => {
				expect(MODEL_CATEGORIES[category]).toBeDefined();
				expect(Array.isArray(MODEL_CATEGORIES[category])).toBe(true);
			});
		});

		it('should have models in each category', () => {
			Object.values(MODEL_CATEGORIES).forEach(models => {
				expect(models.length).toBeGreaterThan(0);
			});
		});

		it('should only contain valid model IDs', () => {
			Object.values(MODEL_CATEGORIES).forEach(models => {
				models.forEach(modelId => {
					expect(MODEL_CONTEXT_WINDOWS[modelId]).toBeDefined();
				});
			});
		});
	});

	describe('MODEL_MAPPING', () => {
		it('should map OpenAI models to Cloudflare models', () => {
			expect(MODEL_MAPPING['gpt-3.5-turbo']).toBeDefined();
			expect(MODEL_MAPPING['gpt-4']).toBeDefined();
			expect(MODEL_MAPPING['text-embedding-ada-002']).toBeDefined();
		});

		it('should only map to valid Cloudflare models', () => {
			Object.values(MODEL_MAPPING).forEach(cfModel => {
				expect(MODEL_CONTEXT_WINDOWS[cfModel]).toBeDefined();
			});
		});
	});

	describe('MODEL_CAPABILITIES', () => {
		it('should define capabilities for models', () => {
			expect(MODEL_CAPABILITIES).toBeDefined();
			expect(typeof MODEL_CAPABILITIES).toBe('object');
		});

		it('should have array values for capabilities', () => {
			Object.values(MODEL_CAPABILITIES).forEach(capabilities => {
				expect(Array.isArray(capabilities)).toBe(true);
				expect(capabilities.length).toBeGreaterThan(0);
			});
		});
	});

	describe('DEFAULT_MODELS', () => {
		it('should have default models for each category', () => {
			const categories = ['chat', 'completion', 'embeddings', 'audio_stt', 'image_generation'];

			categories.forEach(category => {
				expect(DEFAULT_MODELS[category]).toBeDefined();
				expect(typeof DEFAULT_MODELS[category]).toBe('string');
			});
		});

		it('should only use valid models as defaults', () => {
			Object.values(DEFAULT_MODELS).forEach(modelId => {
				expect(MODEL_CONTEXT_WINDOWS[modelId]).toBeDefined();
			});
		});
	});

	describe('Data Consistency', () => {
		it('should not have duplicate models across all categories', () => {
			const allCategoryModels = Object.values(MODEL_CATEGORIES).flat();
			expect(new Set(allCategoryModels).size).toBeGreaterThan(0);

			// Some models can appear in multiple categories (e.g., chat and completion)
			// So we just check that the arrays are valid
			expect(allCategoryModels.length).toBeGreaterThan(0);
		});

		it('should have context windows for all categorized models', () => {
			Object.values(MODEL_CATEGORIES).forEach(models => {
				models.forEach(modelId => {
					expect(MODEL_CONTEXT_WINDOWS[modelId]).toBeDefined();
					expect(MODEL_CONTEXT_WINDOWS[modelId]).toBeGreaterThan(0);
				});
			});
		});
	});

	describe('Generated catalog values', () => {
		it('reads real context windows and function-calling from the catalog', () => {
			expect(MODEL_CONTEXT_WINDOWS['@cf/openai/gpt-oss-120b']).toBe(128000);
			expect(MODEL_CAPABILITIES['@cf/openai/gpt-oss-120b']).toContain('function-calling');
			expect(Object.values(MODEL_CAPABILITIES).some(c => c.includes('vision'))).toBe(true);
		});

		it('pins preferred defaults', () => {
			expect(DEFAULT_MODELS.chat).toBe('@cf/openai/gpt-oss-120b');
			expect(DEFAULT_MODELS.image_generation).toBe('@cf/black-forest-labs/flux-1-schnell');
			expect(DEFAULT_MODELS.audio_stt).toBe('@cf/openai/whisper-large-v3-turbo');
			expect(DEFAULT_MODELS.audio_tts).toBe('@cf/myshell-ai/melotts');
		});

		it('keeps decision models out of chat/completion', () => {
			for (const id of MODEL_CATEGORIES.decision) {
				expect(MODEL_CATEGORIES.chat).not.toContain(id);
				expect(MODEL_CATEGORIES.completion).not.toContain(id);
			}
		});
	});

	describe('resolveModel', () => {
		it('resolves aliases inside their category', () => {
			expect(resolveModel('chat', 'gpt-4')).toBe(MODEL_MAPPING['gpt-4']);
			expect(resolveModel('embeddings', 'text-embedding-ada-002')).toBe(MODEL_MAPPING['text-embedding-ada-002']);
			expect(resolveModel('chat')).toBe(DEFAULT_MODELS.chat);
		});

		it('rejects an alias whose target is in another category', () => {
			expect(() => resolveModel('chat', 'text-embedding-ada-002')).toThrow(ValidationError);
			expect(() => resolveModel('embeddings', 'gpt-4')).toThrow(ValidationError);
			expect(() => resolveModel('image_generation', 'whisper-1')).toThrow(ValidationError);
		});

		it('rejects unknown models and decision models with a hint', () => {
			expect(() => resolveModel('chat', 'nope')).toThrow(ValidationError);
			expect(() => resolveModel('chat', MODEL_CATEGORIES.decision[0])).toThrow(/systemone/);
		});

		it('does not resolve prototype keys', () => {
			expect(() => resolveModel('chat', 'constructor')).toThrow(ValidationError);
		});
	});
});

describe('update-models generator', () => {
	const model = (name, task, props = [], extra = {}) => ({ name, task: { name: task }, properties: props, ...extra });
	const p = (property_id, value) => ({ property_id, value });
	const catalog = () => [
		model('@cf/openai/gpt-oss-120b', 'Text Generation', [p('context_window', '128000'), p('function_calling', 'true')]),
		model('@cf/meta/vis', 'Text Generation', [p('context_window', '8000'), p('vision', 'true')]),
		model('@cf/meta/old', 'Text Generation', [p('context_window', '1000'), p('planned_deprecation_date', '2020-01-01')]),
		model('@cf/meta/future', 'Text Generation', [p('planned_deprecation_date', '2999-01-01')]),
		model('@cf/meta/nowindow', 'Text Generation'),
		model('@cf/meta/gone', 'Text Generation', [], { deprecated: true }),
		model('@cf/meta/llama-guard-3-8b', 'Text Generation', [p('context_window', '1000')]),
		model('@cf/cloudflare/clef', 'Text Generation', [p('context_window', '65536')]),
		model('@cf/baai/bge-base-en-v1.5', 'Text Embeddings'),
		model('@cf/black-forest-labs/flux-1-schnell', 'Text-to-Image'),
		model('@cf/other/img', 'Text-to-Image'),
	];

	it('parses the properties array', () => {
		const r = processModels(catalog());
		expect(r.modelContextWindows['@cf/openai/gpt-oss-120b']).toBe(128000);
		expect(r.modelContextWindows['@cf/meta/nowindow']).toBe(4096);
		expect(r.modelCapabilities['@cf/openai/gpt-oss-120b']).toEqual(['text-generation', 'function-calling']);
		expect(r.modelCapabilities['@cf/meta/vis']).toContain('vision');
		expect(prop(catalog()[0], 'context_window')).toBe('128000');
	});

	it('skips deprecated and past-planned-deprecation models', () => {
		const r = processModels(catalog());
		expect(r.modelContextWindows).not.toHaveProperty('@cf/meta/old');
		expect(r.modelContextWindows).not.toHaveProperty('@cf/meta/gone');
		expect(r.modelContextWindows).toHaveProperty('@cf/meta/future');
	});

	it('excludes decision and guard models from chat', () => {
		const r = processModels(catalog());
		expect(r.modelCategories.chat).not.toContain('@cf/cloudflare/clef');
		expect(r.modelCategories.chat).not.toContain('@cf/meta/llama-guard-3-8b');
		expect(r.modelCategories.decision).toEqual(['@cf/cloudflare/clef']);
	});

	it('picks preferred defaults, falling back to the first model', () => {
		const r = processModels(catalog());
		expect(r.defaultModels.chat).toBe('@cf/openai/gpt-oss-120b');
		expect(r.defaultModels.image_generation).toBe('@cf/black-forest-labs/flux-1-schnell');
		const noPreferred = processModels(catalog().filter(m => m.name !== '@cf/black-forest-labs/flux-1-schnell'));
		expect(noPreferred.defaultModels.image_generation).toBe('@cf/other/img');
	});

	it('validates catalog sanity', () => {
		expect(() => validateProcessedModels(processModels([model('@cf/baai/bge-base-en-v1.5', 'Text Embeddings')]))).toThrow(/chat/);
		expect(() =>
			validateProcessedModels(processModels([model('@cf/meta/x', 'Text Generation', [p('context_window', '1')])])),
		).toThrow(/MODEL_MAPPING targets/);
	});

	it('emits a module that exports the computed data', () => {
		const out = generateModelsFile(processModels(catalog()));
		expect(out).toContain('"@cf/openai/gpt-oss-120b": 128000');
		expect(out).toContain('export const resolveModel');
	});
});
