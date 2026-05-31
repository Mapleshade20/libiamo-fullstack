import { error, fail } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { INTERACTION_TYPE_LABELS, LANGUAGE_CODES, type LanguageCode, UI_VARIANT_LABELS } from "$lib/constants";
import { requireUser } from "$lib/server/authz";
import { db } from "$lib/server/db";
import { user as authUser } from "$lib/server/db/auth.schema";
import { practiceSession, task, template, templateVariant } from "$lib/server/db/schema";
import { OpenAIAuthError } from "$lib/server/llm";
import { evaluateUserTranslation, generateExpressions } from "$lib/server/translate";
import type { Actions, PageServerLoad } from "./$types";

/** Validate and cast a language code, defaulting to "en" */
function validateLanguageCode(code: unknown): LanguageCode {
	if (typeof code === "string" && (LANGUAGE_CODES as readonly string[]).includes(code)) {
		return code as LanguageCode;
	}
	return "en";
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const taskId = Number(event.params.id);

	if (Number.isNaN(taskId)) {
		return error(404, "Task not found");
	}

	const [result] = await db
		.select({
			id: task.id,
			title: task.title,
			description: task.description,
			objectives: task.objectives,
			date: task.date,
			language: task.language,
			templateInteractionType: template.interactionType,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			materialsMd: template.materialsMd,
			estimatedWords: template.estimatedWords,
			maxTurns: template.maxTurns,
			pointReward: template.pointReward,
			gemReward: template.gemReward,
			openingState: templateVariant.openingState,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.leftJoin(templateVariant, eq(task.variantId, templateVariant.id))
		.where(eq(task.id, taskId))
		.limit(1);

	if (!result) {
		return error(404, "Task not found");
	}

	const latestSession = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.taskId, taskId), eq(practiceSession.userId, user.id)),
		orderBy: (sessions, { desc }) => [desc(sessions.startedAt), desc(sessions.id)],
		columns: {
			status: true,
		},
	});

	// Fetch user's native language for translation direction
	const [userRecord] = await db.select({ nativeLanguage: authUser.nativeLanguage }).from(authUser).where(eq(authUser.id, user.id)).limit(1);

	const nativeLanguage = userRecord?.nativeLanguage ?? null;

	return {
		task: {
			...result,
			sessionStatus: latestSession?.status ?? null,
		},
		nativeLanguage,
	};
};

export const actions: Actions = {
	/** Generate 2-3 useful expressions for the task in the user's native language */
	generateExpressions: async (event) => {
		const user = requireUser(event);

		const formData = await event.request.formData();
		const title = formData.get("title");
		const description = formData.get("description");
		const objectivesRaw = formData.get("objectives");
		const interactionType = formData.get("interactionType");
		const ui = formData.get("ui");
		const nativeLang = formData.get("nativeLanguage");
		const targetLang = formData.get("targetLanguage");

		if (!title || typeof title !== "string" || !title.trim()) {
			return fail(400, { error: "Missing task title" });
		}

		let objectives: string[] | null = null;
		if (objectivesRaw && typeof objectivesRaw === "string") {
			try {
				objectives = JSON.parse(objectivesRaw);
			} catch {
				// ignore parse errors
			}
		}

		const uiLabel = typeof ui === "string" ? (UI_VARIANT_LABELS[ui as keyof typeof UI_VARIANT_LABELS] ?? ui) : undefined;
		const interactionLabel =
			typeof interactionType === "string"
				? (INTERACTION_TYPE_LABELS[interactionType as keyof typeof INTERACTION_TYPE_LABELS] ?? interactionType)
				: undefined;

		if (!nativeLang || typeof nativeLang !== "string" || !nativeLang.trim()) {
			return fail(400, { error: "Please set your native language in your profile before using translation help." });
		}

		try {
			const expressions = await generateExpressions(
				{
					title: title.trim(),
					description: typeof description === "string" ? description : null,
					objectives,
					uiLabel,
					interactionType: interactionLabel,
				},
				nativeLang,
				validateLanguageCode(targetLang),
				user.id,
			);

			return { success: true, expressions };
		} catch (err) {
			console.error("Failed to generate expressions:", err);
			if (err instanceof OpenAIAuthError) {
				return fail(401, { error: "Invalid API key. Please configure a valid API key in your profile settings." });
			}
			return fail(500, { error: "Failed to generate expressions. You may need to configure your own API key." });
		}
	},

	/** Evaluate a user's translation attempt and return feedback + correction */
	evaluateTranslation: async (event) => {
		const user = requireUser(event);

		const formData = await event.request.formData();
		const sourceExpression = formData.get("sourceExpression");
		const userTranslation = formData.get("userTranslation");
		const nativeLang = formData.get("nativeLanguage");
		const targetLang = formData.get("targetLanguage");

		if (!sourceExpression || typeof sourceExpression !== "string" || !sourceExpression.trim()) {
			return fail(400, { error: "Missing source expression" });
		}
		if (!userTranslation || typeof userTranslation !== "string" || !userTranslation.trim()) {
			return fail(400, { error: "Missing your translation" });
		}

		if (!nativeLang || typeof nativeLang !== "string" || !nativeLang.trim()) {
			return fail(400, { error: "Please set your native language in your profile before using translation help." });
		}

		try {
			const { feedback, correction } = await evaluateUserTranslation(
				sourceExpression.trim(),
				userTranslation.trim(),
				nativeLang,
				validateLanguageCode(targetLang),
				user.id,
			);

			return { success: true, feedback, correction };
		} catch (err) {
			console.error("Failed to evaluate translation:", err);
			if (err instanceof OpenAIAuthError) {
				return fail(401, { error: "Invalid API key. Please configure a valid API key in your profile settings." });
			}
			return fail(500, { error: "Failed to evaluate translation. You may need to configure your own API key." });
		}
	},
};
