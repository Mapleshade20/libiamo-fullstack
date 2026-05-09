import { error, fail, redirect } from "@sveltejs/kit";
import { and, desc, eq } from "drizzle-orm";
import { LANGUAGE_LABELS, type LanguageCode } from "$lib/constants";
import { createSingleTurnChat } from "$lib/server/client";
import { db } from "$lib/server/db";
import { template, translationAttempt } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

/** Throw redirect if user is not authenticated */
function requireUser(event: { locals: App.Locals }) {
	const user = event.locals.user;
	if (!user) throw redirect(302, "/sign-in");
	return user;
}

/** Parse translations and attemptId from form data */
function parseTranslationsForm(
	formData: FormData,
): { ok: true; translations: Record<string, string>; attemptId: number | null } | { ok: false; error: string } {
	const raw = formData.get("translations");
	if (!raw || typeof raw !== "string") {
		return { ok: false, error: "Missing translations" };
	}
	let translations: Record<string, string>;
	try {
		translations = JSON.parse(raw);
	} catch {
		return { ok: false, error: "Invalid translations JSON" };
	}
	const attemptIdRaw = formData.get("attemptId");
	const attemptId = attemptIdRaw ? Number(attemptIdRaw) : null;
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
		.where(
			and(
				eq(template.id, templateId),
				eq(template.interactionType, "translate"),
				eq(template.isActive, true),
				eq(template.language, user.activeLanguage as LanguageCode),
			),
		)
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

/** Build the global translation evaluation prompt for the given target language */
function buildTranslationEvalPrompt(targetLang: LanguageCode): string {
	const langName = LANGUAGE_LABELS[targetLang] ?? targetLang.toUpperCase();
	return `You are an expert ${langName} translation evaluator. The user will provide original source sentences (with keys like [0-1]) and their ${langName} translations (with the same keys).

Evaluate the translations and respond with ONLY a JSON object (no markdown fences):
{
  "overallScore": "<A, B, or C>",
  "overallFeedback": "<brief overall comment on translation quality>",
  "highlights": [
    {"key": "<paragraph-index-sentence-index>", "type": "good" | "bad", "feedback": "<specific comment>"}
  ]
}

GRADING SCALE:
- A: Excellent — accurate, natural, appropriate register
- B: Good — mostly accurate with minor issues
- C: Needs improvement — significant errors

CRITICAL RULES FOR FEEDBACK:
1. NEVER use key indices like [0-1] in the feedback text
2. When commenting on a translation, QUOTE FROM THE USER'S ${langName.toUpperCase()} TRANSLATION (not the original source). Always quote the exact words the user wrote.
3. Be specific about what is wrong and how to fix it
4. Focus on: accuracy, grammatical correctness, appropriate register, natural phrasing
5. You MUST provide a highlight entry for EVERY single sentence key in the source text. Do NOT skip or omit any sentence. If a sentence has no issues, still include it with type "good" and brief positive feedback.`;
}

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
	passages: string[][],
	translations: Record<string, string>,
): Promise<{
	overallScore?: string;
	overallFeedback?: string;
	highlights?: { key: string; type: "good" | "bad"; feedback: string }[];
}> {
	const sentences = flattenPassages(passages);

	const sourceLines = sentences.map((s) => `[${s.key}] ${s.text}`).join("\n");
	const translationLines = sentences.map((s) => `[${s.key}] ${translations[s.key] ?? "(missing)"}`).join("\n");

	const userMessage = `Source text sentences:
${sourceLines}

User's translations:
${translationLines}`;

	const { reply } = await createSingleTurnChat({
		systemPrompt: agentPromptBase,
		userMessage,
		options: { temperature: 0.7, maxTokens: 4096 },
	});

	// Try to extract JSON from fenced code block
	let jsonStr = reply.content.trim();
	const fenceStart = jsonStr.indexOf("```");
	if (fenceStart !== -1) {
		let after = jsonStr.slice(fenceStart + 3);
		if (after.startsWith("json")) after = after.slice(4);
		after = after.trimStart();
		const fenceEnd = after.indexOf("```");
		if (fenceEnd !== -1) {
			jsonStr = after.slice(0, fenceEnd).trim();
		}
	}

	// If the entire response is valid JSON, parse it
	try {
		return JSON.parse(jsonStr);
	} catch {
		// If not valid JSON, return the raw content as feedback
		return { overallFeedback: jsonStr };
	}
}

export const actions: Actions = {
	saveDraft: async (event) => {
		const user = requireUser(event);

		const templateId = Number(event.params.id);
		if (Number.isNaN(templateId)) return fail(400, { error: "Invalid template ID" });

		const parsed = parseTranslationsForm(await event.request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });

		// Verify template exists and is a translate template
		const [tpl] = await db
			.select({ id: template.id })
			.from(template)
			.where(and(eq(template.id, templateId), eq(template.interactionType, "translate"), eq(template.isActive, true)))
			.limit(1);
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
			.where(eq(template.id, templateId))
			.limit(1);

		if (!tpl) return fail(404, { error: "Template not found" });

		const recordId = await upsertAttempt(user.id, templateId, parsed.translations, parsed.attemptId);

		// Evaluate via Agent API using the global hardcoded prompt
		if (tpl?.translationBase) {
			try {
				const evalPrompt = buildTranslationEvalPrompt(tpl.language as LanguageCode);
				const evaluation = await evaluateTranslation(evalPrompt, tpl.translationBase as string[][], parsed.translations);
				await db
					.update(translationAttempt)
					.set({ status: "evaluated", evaluation, updatedAt: new Date() })
					.where(eq(translationAttempt.id, recordId));
			} catch (err) {
				console.error("Translation evaluation failed:", err);
				// Keep as "draft" — user can retry
				return fail(500, { error: "Evaluation failed. Please try again." });
			}
		} else {
			// No translation base — just mark as submitted
			await db.update(translationAttempt).set({ status: "submitted", updatedAt: new Date() }).where(eq(translationAttempt.id, recordId));
		}

		return { success: true };
	},
};
