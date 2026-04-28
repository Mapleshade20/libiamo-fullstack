import { error, fail, redirect } from "@sveltejs/kit";
import { and, desc, eq } from "drizzle-orm";
import { LANGUAGE_LABELS, type LanguageCode } from "$lib/constants";
import { createSingleTurnChat } from "$lib/server/client";
import { db } from "$lib/server/db";
import { template, translationAttempt } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) return redirect(302, "/sign-in");

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

	// Try to extract JSON from the response
	let jsonStr = reply.content.trim();
	const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenceMatch) {
		jsonStr = fenceMatch[1].trim();
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
		const user = event.locals.user;
		if (!user) return redirect(302, "/sign-in");

		const templateId = Number(event.params.id);
		if (Number.isNaN(templateId)) return fail(400, { error: "Invalid template ID" });

		const form = await event.request.formData();
		const translationsRaw = form.get("translations");
		if (!translationsRaw || typeof translationsRaw !== "string") {
			return fail(400, { error: "Missing translations" });
		}

		let translations: Record<string, string>;
		try {
			translations = JSON.parse(translationsRaw);
		} catch {
			return fail(400, { error: "Invalid translations JSON" });
		}

		const attemptIdRaw = form.get("attemptId");
		const attemptId = attemptIdRaw ? Number(attemptIdRaw) : null;

		if (attemptId && !Number.isNaN(attemptId)) {
			await db.update(translationAttempt).set({ translations, updatedAt: new Date() }).where(eq(translationAttempt.id, attemptId));
		} else {
			await db.insert(translationAttempt).values({
				userId: user.id,
				templateId,
				translations,
				status: "draft",
			});
		}

		return { success: true };
	},

	submit: async (event) => {
		const user = event.locals.user;
		if (!user) return redirect(302, "/sign-in");

		const templateId = Number(event.params.id);
		if (Number.isNaN(templateId)) return fail(400, { error: "Invalid template ID" });

		const form = await event.request.formData();
		const translationsRaw = form.get("translations");
		if (!translationsRaw || typeof translationsRaw !== "string") {
			return fail(400, { error: "Missing translations" });
		}

		let translations: Record<string, string>;
		try {
			translations = JSON.parse(translationsRaw);
		} catch {
			return fail(400, { error: "Invalid translations JSON" });
		}

		const attemptIdRaw = form.get("attemptId");
		const attemptId = attemptIdRaw ? Number(attemptIdRaw) : null;

		// Fetch the template to get passages and agent prompt for evaluation
		const [tpl] = await db
			.select({
				translationBase: template.translationBase,
				language: template.language,
			})
			.from(template)
			.where(eq(template.id, templateId))
			.limit(1);

		// Save translations first (keep as draft until evaluation succeeds)
		let recordId: number;
		if (attemptId && !Number.isNaN(attemptId)) {
			await db.update(translationAttempt).set({ translations, updatedAt: new Date() }).where(eq(translationAttempt.id, attemptId));
			recordId = attemptId;
		} else {
			const [inserted] = await db
				.insert(translationAttempt)
				.values({
					userId: user.id,
					templateId,
					translations,
					status: "draft",
				})
				.returning({ id: translationAttempt.id });
			recordId = inserted.id;
		}

		// Evaluate via Agent API using the global hardcoded prompt
		if (tpl?.translationBase) {
			try {
				const evalPrompt = buildTranslationEvalPrompt(tpl.language as LanguageCode);
				const evaluation = await evaluateTranslation(evalPrompt, tpl.translationBase as string[][], translations);
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
