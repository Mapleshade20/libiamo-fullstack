import { LANGUAGE_LABELS, type LanguageCode } from "$lib/constants";
import { createSingleTurnChat } from "$lib/server/llm";

/** Resolve a language name from a code, using Intl.DisplayNames for non-learning languages */
function languageName(code: string, fallbackLocale = "en"): string {
	// First check our known learning languages
	if (code in LANGUAGE_LABELS) {
		return LANGUAGE_LABELS[code as LanguageCode];
	}
	// Use Intl API for any other language (e.g. "pl" → "Polish", "zh" → "Chinese")
	try {
		const names = new Intl.DisplayNames([fallbackLocale], { type: "language" });
		const name = names.of(code);
		if (name && name !== code) return name;
	} catch {
		// Intl not available, fall through
	}
	// Last resort: uppercase the code
	return code.toUpperCase();
}

/** A single expression with optional user translation and feedback */
export interface ExpressionItem {
	/** The source expression in native language */
	source: string;
	/** User's translation attempt (empty until they type) */
	userTranslation: string;
	/** AI feedback on user's translation */
	feedback?: string;
	/** A model/reference translation */
	reference?: string;
}

/**
 * Build a prompt for generating useful expressions related to a task scenario.
 * Expressions are generated in the native language for the learner to translate into the target language.
 */
export function buildExpressionsPrompt(nativeLang: string, targetLang: LanguageCode): string {
	const nativeName = languageName(nativeLang);
	const targetName = LANGUAGE_LABELS[targetLang];

	return `You are an expert ${targetName} language teacher. Based on the task/scenario context provided, generate 2-3 useful expressions or short phrases that a learner would find helpful to know before attempting this task.

CRITICAL INSTRUCTION: Write the output expressions in ${nativeName} (the learner's native language), NOT in ${targetName}. These are ${nativeName} translations of phrases the learner will need to SAY in ${targetName} during the task. The learner will see these ${nativeName} expressions and practice translating them into ${targetName}.

## Rules
- Output language: ${nativeName} ONLY — do NOT output ${targetName} text
- Each expression should be a short, practical phrase (1 sentence max)
- Each expression represents something the learner needs to be able to express in ${targetName}
- Return ONLY a JSON array of strings, no markdown fences, no extra text

Example: For a task about ordering at a restaurant, if the native language were English you would output:
["Could I have the check, please?", "Is this seat taken?"]`;
}

/**
 * Build a prompt for evaluating a user's translation attempt.
 */
export function buildEvaluationPrompt(nativeLang: string, targetLang: LanguageCode): string {
	const nativeName = languageName(nativeLang);
	const targetName = LANGUAGE_LABELS[targetLang];

	return `You are an expert ${targetName} language tutor evaluating a learner's translation.

The learner was shown a phrase in ${nativeName} and asked to translate it into ${targetName}.

Evaluate their translation and respond with ONLY a JSON object (no markdown fences):
{
  "feedback": "<a concise, encouraging sentence in ${nativeName} commenting on the translation quality, pointing out any errors and how to fix them>",
  "correction": "<the corrected/natural ${targetName} translation>"
}

## Evaluation Criteria
- Accuracy: does the translation convey the same meaning?
- Grammar: are there any grammatical errors?
- Naturalness: does it sound like something a native ${targetName} speaker would say?
- Register: is the tone appropriate?

## Feedback Style
- Write the feedback in ${nativeName} (the learner's native language) so they can understand it
- Be encouraging and constructive
- If the translation is perfect, say so warmly
- If there are errors, point them out specifically and show the correction
- Keep feedback to 1-2 sentences, friendly tone`;
}

/**
 * Generate useful expressions for a task scenario.
 * Returns an array of expression strings in the native language.
 */
export async function generateExpressions(
	taskContext: {
		title: string;
		description?: string | null;
		objectives?: string[] | null;
		uiLabel?: string;
		interactionType?: string;
	},
	nativeLang: string,
	targetLang: LanguageCode,
	userId?: string,
): Promise<string[]> {
	const prompt = buildExpressionsPrompt(nativeLang, targetLang);

	const contextParts: string[] = [];
	contextParts.push(`Task title: "${taskContext.title}"`);
	if (taskContext.description) {
		contextParts.push(`Task description: "${taskContext.description}"`);
	}
	if (taskContext.objectives && taskContext.objectives.length > 0) {
		contextParts.push(`Objectives: ${taskContext.objectives.map((o) => `"${o}"`).join(", ")}`);
	}
	if (taskContext.uiLabel) {
		contextParts.push(`UI type: ${taskContext.uiLabel}`);
	}
	if (taskContext.interactionType) {
		contextParts.push(`Interaction type: ${taskContext.interactionType}`);
	}

	const context = contextParts.join("\n");

	const { reply } = await createSingleTurnChat(
		{
			systemPrompt: prompt,
			userMessage: `Generate useful expressions for this task scenario:\n\n${context}`,
			options: { temperature: 0.7, maxTokens: 1024 },
		},
		userId,
	);

	// Parse JSON from response
	let jsonStr = reply.content.trim();
	const fenceStart = jsonStr.indexOf("```");
	if (fenceStart !== -1) {
		let after = jsonStr.slice(fenceStart + 3);
		if (after.startsWith("json")) after = after.slice(4);
		after = after.trimStart();
		const fenceEnd = after.indexOf("```");
		if (fenceEnd !== -1) jsonStr = after.slice(0, fenceEnd).trim();
	}

	try {
		const parsed = JSON.parse(jsonStr);
		if (Array.isArray(parsed)) {
			return parsed.filter((e): e is string => typeof e === "string" && e.trim().length > 0);
		}
		return [];
	} catch {
		// Fallback: try to extract lines
		return jsonStr
			.split("\n")
			.map((l) => l.replace(/^[\d.\-\s"]+|"$/g, "").trim())
			.filter((l) => l.length > 0);
	}
}

/**
 * Evaluate a user's translation attempt and return feedback + correction.
 */
export async function evaluateUserTranslation(
	sourceExpression: string,
	userTranslation: string,
	nativeLang: string,
	targetLang: LanguageCode,
	userId?: string,
): Promise<{ feedback: string; correction: string }> {
	const prompt = buildEvaluationPrompt(nativeLang, targetLang);

	const nativeName = languageName(nativeLang);
	const targetName = LANGUAGE_LABELS[targetLang];

	const { reply } = await createSingleTurnChat(
		{
			systemPrompt: prompt,
			userMessage: `Original (${nativeName}): "${sourceExpression.trim()}"\n\nLearner's ${targetName} translation: "${userTranslation.trim()}"`,
			options: { temperature: 0.7, maxTokens: 1024 },
		},
		userId,
	);

	let jsonStr = reply.content.trim();
	const fenceStart = jsonStr.indexOf("```");
	if (fenceStart !== -1) {
		let after = jsonStr.slice(fenceStart + 3);
		if (after.startsWith("json")) after = after.slice(4);
		after = after.trimStart();
		const fenceEnd = after.indexOf("```");
		if (fenceEnd !== -1) jsonStr = after.slice(0, fenceEnd).trim();
	}

	try {
		const parsed = JSON.parse(jsonStr);
		return {
			feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
			correction: typeof parsed.correction === "string" ? parsed.correction : "",
		};
	} catch {
		return { feedback: jsonStr, correction: "" };
	}
}
