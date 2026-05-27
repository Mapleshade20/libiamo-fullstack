import { error, fail, redirect } from "@sveltejs/kit";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { LANGUAGE_CODES, LANGUAGE_LABELS, type LanguageCode, PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { db } from "$lib/server/db";
import { template, translationAttempt } from "$lib/server/db/schema";
import { chatJson, chatText, OpenAIAuthError } from "$lib/server/llm";
import type { Actions, PageServerLoad } from "./$types";

/** Maximum form data size for translation JSON (100KB) */
const MAX_TRANSLATION_FORM_SIZE = 100 * 1024;
const TUTOR_HELP_TEXT_MAX_LENGTH = PRACTICE_UI_TEXT_MAX_LENGTH;

/** Throw redirect if user is not authenticated */
function requireUser(event: { locals: App.Locals }) {
	const user = event.locals.user;
	if (!user) throw redirect(302, "/sign-in");
	return user;
}

/** Validate and cast a language code, defaulting to "en" */
function validateLanguageCode(code: unknown): LanguageCode {
	if (typeof code === "string" && (LANGUAGE_CODES as readonly string[]).includes(code)) {
		return code as LanguageCode;
	}
	return "en";
}

/** Extract a required non-empty string field from FormData, or null */
function getFormString(formData: FormData, field: string): string | null {
	const value = formData.get(field);
	if (!value || typeof value !== "string" || !value.trim()) return null;
	return value.trim();
}

/** Validate language code and return its display name */
function getLangName(code: unknown): string {
	return LANGUAGE_LABELS[validateLanguageCode(code)];
}

function hasOversizedTutorHelpText(values: string[]) {
	return values.some((value) => value.length > TUTOR_HELP_TEXT_MAX_LENGTH);
}

/** Handle LLM errors with auth-specific messaging */
function handleLlmError(err: unknown, fallback: string) {
	console.error(fallback, err);
	if (err instanceof OpenAIAuthError) {
		return fail(401, { error: "Invalid API key. Please configure a valid API key in your profile settings." });
	}
	return fail(500, { error: fallback });
}

/** Template filter conditions shared by load and action auth checks */
const translateTemplateFilter = (templateId: number, userLanguage: string) =>
	and(
		eq(template.id, templateId),
		eq(template.interactionType, "translate"),
		eq(template.isActive, true),
		eq(template.language, userLanguage as LanguageCode),
	);

async function getAccessibleTranslateTemplateLanguage(templateId: number, activeLanguage: string) {
	const [tpl] = await db.select({ language: template.language }).from(template).where(translateTemplateFilter(templateId, activeLanguage)).limit(1);
	return tpl?.language as LanguageCode | undefined;
}

/** Parse translations and attemptId from form data, with size limit */
function parseTranslationsForm(
	formData: FormData,
): { ok: true; translations: Record<string, string>; attemptId: number | null } | { ok: false; error: string } {
	const raw = formData.get("translations");
	if (!raw || typeof raw !== "string") {
		return { ok: false, error: "Missing translations" };
	}

	// Reject oversized payloads to prevent DoS
	if (raw.length > MAX_TRANSLATION_FORM_SIZE) {
		return { ok: false, error: "Translation data too large" };
	}

	let translations: Record<string, string>;
	try {
		translations = JSON.parse(raw);
	} catch {
		return { ok: false, error: "Invalid translations JSON" };
	}
	if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
		return { ok: false, error: "Invalid translations JSON" };
	}
	if (Object.values(translations).some((value) => typeof value !== "string")) {
		return { ok: false, error: "Invalid translations JSON" };
	}
	if (Object.values(translations).some((value) => value.length > PRACTICE_UI_TEXT_MAX_LENGTH)) {
		return { ok: false, error: "Translation text is too long" };
	}
	const attemptIdRaw = formData.get("attemptId");
	const attemptId = attemptIdRaw ? Number(attemptIdRaw) : null;
	if (attemptIdRaw && (!Number.isFinite(attemptId) || !Number.isInteger(attemptId))) {
		return { ok: false, error: "Invalid attempt ID" };
	}
	return { ok: true, translations, attemptId };
}

/** Insert a new attempt or update an existing one, returning the record ID */
async function upsertAttempt(userId: string, templateId: number, translations: Record<string, string>, attemptId: number | null): Promise<number> {
	if (attemptId && !Number.isNaN(attemptId)) {
		const [updated] = await db
			.update(translationAttempt)
			.set({ translations, updatedAt: new Date() })
			.where(and(eq(translationAttempt.id, attemptId), eq(translationAttempt.userId, userId), eq(translationAttempt.templateId, templateId)))
			.returning({ id: translationAttempt.id });
		if (!updated) {
			throw error(403, "Attempt not found or not owned by user");
		}
		return updated.id;
	}
	const [inserted] = await db
		.insert(translationAttempt)
		.values({ userId, templateId, translations, status: "draft" })
		.returning({ id: translationAttempt.id });
	return inserted.id;
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);

	const templateId = Number(event.params.id);
	if (Number.isNaN(templateId)) {
		return error(404, "Template not found");
	}

	const [tpl] = await db
		.select({
			id: template.id,
			title: template.titleBase,
			description: template.descriptionBase,
			shortObjective: template.shortObjectiveBase,
			language: template.language,
			materialsMd: template.materialsMd,
			translationBase: template.translationBase,
			difficulty: template.difficulty,
			estimatedWords: template.estimatedWords,
			pointReward: template.pointReward,
			gemReward: template.gemReward,
		})
		.from(template)
		.where(translateTemplateFilter(templateId, user.activeLanguage))
		.limit(1);

	if (!tpl) {
		return error(404, "Translation template not found");
	}

	// Load latest draft for this user + template
	const [latestAttempt] = await db
		.select({
			id: translationAttempt.id,
			translations: translationAttempt.translations,
			status: translationAttempt.status,
			evaluation: translationAttempt.evaluation,
		})
		.from(translationAttempt)
		.where(and(eq(translationAttempt.userId, user.id), eq(translationAttempt.templateId, templateId)))
		.orderBy(desc(translationAttempt.updatedAt))
		.limit(1);

	return {
		template: tpl,
		attempt: latestAttempt ?? null,
	};
};

/** Resolve a display name for a language code, with fallback for runtime-cast values */
function promptLangName(targetLang: LanguageCode): string {
	return LANGUAGE_LABELS[targetLang] ?? targetLang.toUpperCase();
}

/** Build the global translation evaluation prompt for the given target language */
function buildTranslationEvalPrompt(targetLang: LanguageCode): string {
	const langName = promptLangName(targetLang);
	return `You are an expert ${langName} translation evaluator. The user will provide original source sentences (with keys like [0-1]) and their ${langName} translations (with the same keys).

Evaluate the translations and respond with ONLY this JSON object shape (no markdown fences): {"overallScore":"<A, B, or C>","overallFeedback":"<brief overall comment on translation quality>","highlights":[{"key":"<paragraph-index-sentence-index>","type":"good or bad","feedback":"<specific comment>","grammarNote":"<for bad highlights: one-sentence explanation of the grammar rule or error>"}]}

GRADING SCALE:
- A: Excellent — accurate, natural, appropriate register
- B: Good — mostly accurate with minor issues
- C: Needs improvement — significant errors

CRITICAL RULES FOR FEEDBACK:
1. NEVER use key indices like [0-1] in the feedback text
2. When commenting on a translation, QUOTE FROM THE USER'S ${langName.toUpperCase()} TRANSLATION (not the original source). Always quote the exact words the user wrote.
3. Be specific about what is wrong and how to fix it
4. Focus on: accuracy, grammatical correctness, appropriate register, natural phrasing
5. You MUST provide a highlight entry for EVERY single sentence key in the source text. Do NOT skip or omit any sentence. If a sentence has no issues, still include it with type "good" and brief positive feedback.
6. For "bad" highlights, ALWAYS include a "grammarNote" field: a one-sentence explanation of the grammar rule or error (e.g., "The verb 'enfocar' requires the reflexive 'se' and preposition 'en' — it should be 'se centra en' or 'está enfocada en'."). For "good" highlights, omit the grammarNote field.`;
}

const TranslationEvalSchema = z.object({
	overallScore: z.enum(["A", "B", "C"]),
	overallFeedback: z.string(),
	highlights: z
		.array(
			z.object({
				key: z.string(),
				type: z.enum(["good", "bad"]),
				feedback: z.string(),
				grammarNote: z.string().optional(),
			}),
		)
		.optional(),
});

const ModelTranslationsSchema = z.record(z.string(), z.string());

/** Flatten passages (string[][]) into a numbered sentence list */
function flattenPassages(passages: string[][]): { key: string; text: string }[] {
	const sentences: { key: string; text: string }[] = [];
	for (let pi = 0; pi < passages.length; pi++) {
		for (let si = 0; si < passages[pi].length; si++) {
			sentences.push({ key: `${pi}-${si}`, text: passages[pi][si] });
		}
	}
	return sentences;
}

async function evaluateTranslation(
	agentPromptBase: string,
	sentences: { key: string; text: string }[],
	translations: Record<string, string>,
	userId: string,
): Promise<z.infer<typeof TranslationEvalSchema>> {
	const sourceLines = sentences.map((s) => `[${s.key}] ${s.text}`).join("\n");
	const translationLines = sentences.map((s) => `[${s.key}] ${translations[s.key] ?? "(missing)"}`).join("\n");

	const userMessage = `Source text sentences:
${sourceLines}

User's translations:
${translationLines}`;

	return await chatJson(TranslationEvalSchema, {
		messages: [
			{ role: "system", content: agentPromptBase },
			{ role: "user", content: userMessage },
		],
		options: { temperature: 0.7, maxTokens: 4096 },
		userId,
	});
}

/** Build a prompt for generating a reference model translation */
function buildModelTranslationPrompt(targetLang: LanguageCode): string {
	const langName = promptLangName(targetLang);
	return `You are an expert ${langName} translator. Translate the following sentences into natural, fluent ${langName}. Return ONLY a JSON object mapping each sentence key to its translation (no markdown fences, no extra text).

Example format: {"0-0":"translated sentence here","0-1":"another translation"}`;
}

/** Build a prompt for explaining a specific grammar/translation feedback in detail */
function buildExplainFeedbackPrompt(targetLang: LanguageCode): string {
	const langName = promptLangName(targetLang);
	return `You are an expert ${langName} language tutor. A learner received the following feedback on their ${langName} translation. Your job is to expand on this feedback with a detailed, pedagogical explanation.

## Response Format
Respond in Markdown. Structure your explanation as follows:

1. **What went wrong** — Explain the specific error in the learner's translation.
2. **The rule** — Explain the relevant grammar rule, usage convention, or idiom.
3. **Examples** — Provide 2-3 example sentences showing correct usage (with translations).
4. **Related expressions** — Mention any alternative ways to express the same idea, or related patterns.

Keep the tone encouraging and instructive. Use the learner's target language (${langName}) for examples, with English explanations where helpful.`;
}

/** Check if a sentence is too short to be worth translating/evaluating */
function isShortSentence(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length === 0) return true;
	const wordCount = trimmed.split(/\s+/).length;
	return wordCount <= 3 || trimmed.length <= 20;
}

export const actions: Actions = {
	saveDraft: async (event) => {
		const user = requireUser(event);

		const templateId = Number(event.params.id);
		if (Number.isNaN(templateId)) return fail(400, { error: "Invalid template ID" });

		const parsed = parseTranslationsForm(await event.request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });

		// Verify template exists, is active, is a translate template, and matches user language
		const [tpl] = await db.select({ id: template.id }).from(template).where(translateTemplateFilter(templateId, user.activeLanguage)).limit(1);
		if (!tpl) return fail(404, { error: "Template not found" });

		await upsertAttempt(user.id, templateId, parsed.translations, parsed.attemptId);
		return { success: true };
	},

	submit: async (event) => {
		const user = requireUser(event);

		const templateId = Number(event.params.id);
		if (Number.isNaN(templateId)) return fail(400, { error: "Invalid template ID" });

		const parsed = parseTranslationsForm(await event.request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });

		// Fetch the template to get passages and agent prompt for evaluation
		const [tpl] = await db
			.select({
				translationBase: template.translationBase,
				language: template.language,
			})
			.from(template)
			.where(translateTemplateFilter(templateId, user.activeLanguage))
			.limit(1);

		if (!tpl) return fail(404, { error: "Template not found" });

		const recordId = await upsertAttempt(user.id, templateId, parsed.translations, parsed.attemptId);

		// Evaluate via Agent API using the global hardcoded prompt
		if (tpl?.translationBase) {
			try {
				const fullPassages = tpl.translationBase as string[][];
				// Build evaluable sentence list preserving original keys
				const allSentences = flattenPassages(fullPassages);
				const evaluableSentences = allSentences.filter((s) => !isShortSentence(s.text));
				const evaluableTranslations: Record<string, string> = {};
				for (const s of evaluableSentences) {
					if (parsed.translations[s.key]?.trim()) {
						evaluableTranslations[s.key] = parsed.translations[s.key];
					}
				}

				const evalPrompt = buildTranslationEvalPrompt(tpl.language as LanguageCode);
				// If all sentences were filtered as short, skip LLM evaluation
				let evaluation: {
					overallScore?: string;
					overallFeedback?: string;
					highlights?: { key: string; type: "good" | "bad"; feedback: string }[];
				};
				if (evaluableSentences.length === 0) {
					evaluation = {};
				} else {
					evaluation = await evaluateTranslation(evalPrompt, evaluableSentences, evaluableTranslations, user.id);
				}
				await db
					.update(translationAttempt)
					.set({ status: "evaluated", evaluation, updatedAt: new Date() })
					.where(eq(translationAttempt.id, recordId));
			} catch (err) {
				console.error("Translation evaluation failed:", err);
				if (err instanceof OpenAIAuthError) {
					return fail(401, { error: "Invalid API key. Please configure a valid API key in your profile settings." });
				}
				// Keep as "draft" — user can retry
				return fail(500, { error: "Evaluation failed. Please try again." });
			}
		} else {
			// No translation base — just mark as submitted
			await db.update(translationAttempt).set({ status: "submitted", updatedAt: new Date() }).where(eq(translationAttempt.id, recordId));
		}

		return { success: true };
	},

	generateModelTranslation: async (event) => {
		const user = requireUser(event);

		const templateId = Number(event.params.id);
		if (Number.isNaN(templateId)) return fail(400, { error: "Invalid template ID" });

		const [tpl] = await db
			.select({
				translationBase: template.translationBase,
				language: template.language,
			})
			.from(template)
			.where(translateTemplateFilter(templateId, user.activeLanguage))
			.limit(1);

		if (!tpl?.translationBase) return fail(404, { error: "Template has no translation base" });

		const passages = tpl.translationBase as string[][];
		const sentences = flattenPassages(passages);

		const sourceLines = sentences.map((s) => `[${s.key}] ${s.text}`).join("\n");
		const prompt = buildModelTranslationPrompt(tpl.language as LanguageCode);

		try {
			const modelTranslations = await chatJson(ModelTranslationsSchema, {
				messages: [
					{ role: "system", content: prompt },
					{ role: "user", content: `Translate these sentences:\n${sourceLines}` },
				],
				options: { temperature: 0.5, maxTokens: 4096 },
				userId: user.id,
			});
			return { success: true, modelTranslations };
		} catch (err) {
			console.error("Model translation generation failed:", err);
			if (err instanceof OpenAIAuthError) {
				return fail(401, { error: "Invalid API key. Please configure a valid API key in your profile settings." });
			}
			return fail(500, { error: "Failed to generate model translation. You may need to configure your own API key." });
		}
	},

	explainFeedback: async (event) => {
		const user = requireUser(event);
		const formData = await event.request.formData();
		const templateId = Number(event.params.id);
		if (Number.isNaN(templateId)) return fail(400, { error: "Invalid template ID" });

		const sourceSentence = getFormString(formData, "sourceSentence");
		if (!sourceSentence) return fail(400, { error: "Missing source sentence" });
		const userTranslation = getFormString(formData, "userTranslation");
		if (!userTranslation) return fail(400, { error: "Missing user translation" });
		const feedback = getFormString(formData, "feedback");
		if (!feedback) return fail(400, { error: "Missing feedback" });
		if (hasOversizedTutorHelpText([sourceSentence, userTranslation, feedback])) return fail(400, { error: "Tutor help text is too long" });

		const targetLanguage = await getAccessibleTranslateTemplateLanguage(templateId, user.activeLanguage);
		if (!targetLanguage) return fail(404, { error: "Template not found" });
		const langName = getLangName(targetLanguage);
		const prompt = buildExplainFeedbackPrompt(targetLanguage);

		try {
			const reply = await chatText({
				messages: [
					{ role: "system", content: prompt },
					{
						role: "user",
						content: `Source sentence: "${sourceSentence}"\n\nLearner's ${langName} translation: "${userTranslation}"\n\nThe feedback they received: "${feedback}"\n\nPlease expand on this feedback with a detailed explanation.`,
					},
				],
				options: { temperature: 0.7, maxTokens: 4096 },
				userId: user.id,
			});
			return { success: true, explanation: reply.content };
		} catch (err) {
			return handleLlmError(err, "Failed to generate explanation. You may need to configure your own API key.");
		}
	},

	translateSentence: async (event) => {
		const user = requireUser(event);
		const formData = await event.request.formData();
		const templateId = Number(event.params.id);
		if (Number.isNaN(templateId)) return fail(400, { error: "Invalid template ID" });

		const sourceSentence = getFormString(formData, "sourceSentence");
		if (!sourceSentence) return fail(400, { error: "Missing source sentence" });
		if (hasOversizedTutorHelpText([sourceSentence])) return fail(400, { error: "Tutor help text is too long" });

		const targetLanguage = await getAccessibleTranslateTemplateLanguage(templateId, user.activeLanguage);
		if (!targetLanguage) return fail(404, { error: "Template not found" });
		const langName = getLangName(targetLanguage);

		try {
			const reply = await chatText({
				messages: [
					{
						role: "system",
						content: `You are an expert ${langName} translator. Translate the following sentence into natural, fluent ${langName}. Return ONLY the translation, no extra text, no quotes, no explanation.`,
					},
					{ role: "user", content: sourceSentence },
				],
				options: { temperature: 0.3, maxTokens: 512 },
				userId: user.id,
			});
			return { success: true, translation: reply.content.trim() };
		} catch (err) {
			return handleLlmError(err, "Failed to translate sentence. You may need to configure your own API key.");
		}
	},

	askTutor: async (event) => {
		const user = requireUser(event);
		const formData = await event.request.formData();
		const templateId = Number(event.params.id);
		if (Number.isNaN(templateId)) return fail(400, { error: "Invalid template ID" });

		const sourceSentence = getFormString(formData, "sourceSentence");
		if (!sourceSentence) return fail(400, { error: "Missing source sentence" });
		const userTranslation = getFormString(formData, "userTranslation");
		if (!userTranslation) return fail(400, { error: "Missing user translation" });
		const feedback = getFormString(formData, "feedback");
		if (!feedback) return fail(400, { error: "Missing feedback" });
		const question = getFormString(formData, "question");
		if (!question) return fail(400, { error: "Missing question" });
		if (hasOversizedTutorHelpText([sourceSentence, userTranslation, feedback, question])) return fail(400, { error: "Tutor help text is too long" });

		const targetLanguage = await getAccessibleTranslateTemplateLanguage(templateId, user.activeLanguage);
		if (!targetLanguage) return fail(404, { error: "Template not found" });
		const langName = getLangName(targetLanguage);

		try {
			const reply = await chatText({
				messages: [
					{
						role: "system",
						content: `You are an expert ${langName} language tutor. A learner received feedback on their translation. Answer their follow-up question helpfully and concisely in Markdown. Reference the original sentence and feedback in your answer.`,
					},
					{
						role: "user",
						content: `Source sentence: "${sourceSentence}"\n\nLearner's translation: "${userTranslation}"\n\nFeedback received: "${feedback}"\n\nLearner's question: ${question}`,
					},
				],
				options: { temperature: 0.7, maxTokens: 2048 },
				userId: user.id,
			});
			return { success: true, answer: reply.content };
		} catch (err) {
			return handleLlmError(err, "Failed to get answer. You may need to configure your own API key.");
		}
	},
};
