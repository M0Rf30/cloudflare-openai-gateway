import { MODEL_CATEGORIES, DEFAULT_MODELS } from '../utils/models.js';
import { getCORSHeaders } from '../utils/format.js';
import { asyncErrorHandler, ValidationError } from '../utils/errors.js';

const DECISION_MODEL_PATH_PREFIX = '@cf/cloudflare/';

// Accept both the System One selector ("clef-flash") and the Workers AI path ("@cf/cloudflare/clef-flash").
function resolveDecisionModel(requested) {
	const supported = MODEL_CATEGORIES.decision ?? [];
	if (requested === undefined) return DEFAULT_MODELS.decision;
	if (typeof requested !== 'string') {
		throw new ValidationError('model must be a string', 'model');
	}
	const name = requested.trim();
	const path = name.startsWith('@cf/') ? name : `${DECISION_MODEL_PATH_PREFIX}${name}`;
	if (!supported.includes(path)) {
		throw new ValidationError(
			`Unsupported decision model: ${requested}. Supported models: ${supported.join(', ')}`,
			'model',
		);
	}
	return path;
}

/**
 * POST /v1/systemone — System One API (Jev-compatible) backed by Workers AI Clef models.
 * Body: { model?, state, questions, images?, audio?, videos? }; response is the model's
 * `{ model, answers, usage }` unchanged.
 */
export const systemOneHandler = asyncErrorHandler(async (request, env) => {
	if (!request.headers.get('Content-Type')?.includes('application/json')) {
		throw new ValidationError('Invalid request. Content-Type must be application/json');
	}

	const json = await request.json();
	if (json === null || typeof json !== 'object' || Array.isArray(json)) {
		throw new ValidationError('Request body must be a JSON object');
	}

	const modelPath = resolveDecisionModel(json.model);

	if (json.state === undefined || json.state === null) {
		throw new ValidationError('state is required', 'state');
	}
	if (
		!json.questions ||
		typeof json.questions !== 'object' ||
		Array.isArray(json.questions) ||
		Object.keys(json.questions).length === 0
	) {
		throw new ValidationError('questions must be a non-empty object of typed questions', 'questions');
	}

	// Workers AI requires the short selector in the body ("clef", "clef-flash", "clef-omni").
	const selector = modelPath.slice(DECISION_MODEL_PATH_PREFIX.length);
	const result = await env.AI.run(modelPath, { ...json, model: selector });

	return Response.json(result, { headers: getCORSHeaders() });
});
