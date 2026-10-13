import { MODEL_CATEGORIES, DEFAULT_MODELS } from '../utils/models.js';
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

const QUESTION_TYPES = ['noul', 'choice', 'score'];
const QUESTION_ID = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_QUESTIONS = 64;

function isPresent(value) {
	if (value === undefined || value === null) return false;
	if (typeof value === 'string') return value.trim().length > 0;
	return true;
}

// Mirrors the Clef input schema so malformed questions get a 400 with a precise param.
function validateQuestion(id, question) {
	const param = `questions.${id}`;
	if (!QUESTION_ID.test(id)) {
		throw new ValidationError(
			`Invalid question id "${id}": use 1-100 letters, digits, '_', '.', '-'`,
			'questions',
		);
	}
	if (!question || typeof question !== 'object' || Array.isArray(question)) {
		throw new ValidationError(`${param} must be an object`, param);
	}
	if (!QUESTION_TYPES.includes(question.type)) {
		throw new ValidationError(`${param}.type must be one of: ${QUESTION_TYPES.join(', ')}`, `${param}.type`);
	}
	if (!isPresent(question.instructions)) {
		throw new ValidationError(`${param}.instructions is required`, `${param}.instructions`);
	}
	const { criteria } = question;
	if (question.type === 'choice') {
		const options = criteria && typeof criteria === 'object' && !Array.isArray(criteria) ? Object.keys(criteria) : [];
		if (options.length < 2 || options.length > 255 || options.some(key => key.length === 0)) {
			throw new ValidationError(`${param}.criteria must map 2-255 non-empty option ids to descriptions`, `${param}.criteria`);
		}
	} else if (question.type === 'score') {
		if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10) {
			throw new ValidationError(`${param}.criteria must be an array of 2-10 levels`, `${param}.criteria`);
		}
	} else if (criteria !== undefined && (criteria === null || typeof criteria !== 'object' || Array.isArray(criteria))) {
		throw new ValidationError(`${param}.criteria must be an object with optional true/false descriptions`, `${param}.criteria`);
	}
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
	if (Object.keys(json.questions).length > MAX_QUESTIONS) {
		throw new ValidationError(`questions cannot exceed ${MAX_QUESTIONS} entries`, 'questions');
	}

	for (const [id, question] of Object.entries(json.questions)) {
		validateQuestion(id, question);
	}

	// Workers AI requires the short selector in the body ("clef", "clef-flash", "clef-omni").
	const selector = modelPath.slice(DECISION_MODEL_PATH_PREFIX.length);
	const result = await env.AI.run(modelPath, { ...json, model: selector });

	return Response.json(result);
});
