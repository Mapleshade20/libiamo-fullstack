import { error, fail } from "@sveltejs/kit";
import {
	INTERACTION_TYPE_LABELS,
	LANGUAGE_CODES,
	type LanguageCode,
	PRACTICE_UI_TEXT_MAX_LENGTH,
	UI_VARIANT_LABELS,
	USER_LONG_TEXT_MAX_LENGTH,
} from "$lib/constants";
import { requireUser } from "$lib/server/auth/authz";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import { getTaskPreparationData } from "$lib/server/task-preparation";
import { evaluateUserTranslation, generateExpressions } from "$lib/server/translate";
import type { Actions, PageServerLoad } from "./$types";

const TRANSLATION_HELP_TEXT_MAX_LENGTH = PRACTICE_UI_TEXT_MAX_LENGTH;
const TASK_TRANSLATION_HELP_CONTEXT_MAX_LENGTH = USER_LONG_TEXT_MAX_LENGTH;

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

	const data = await getTaskPreparationData({ userId: user.id, taskId });

	if (!data) {
		return error(404, "Task not found");
	}

	return data;
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
		if (
			title.length > TRANSLATION_HELP_TEXT_MAX_LENGTH ||
			(typeof description === "string" && description.length > TRANSLATION_HELP_TEXT_MAX_LENGTH) ||
			(typeof objectivesRaw === "string" && objectivesRaw.length > TASK_TRANSLATION_HELP_CONTEXT_MAX_LENGTH)
		) {
			return fail(400, { error: "Task context is too long" });
		}

		let objectives: string[] | null = null;
		if (objectivesRaw && typeof objectivesRaw === "string") {
			try {
				objectives = JSON.parse(objectivesRaw);
			} catch {
				// ignore parse errors
			}
		}
		if (objectives?.some((objective) => typeof objective === "string" && objective.length > TRANSLATION_HELP_TEXT_MAX_LENGTH)) {
			return fail(400, { error: "Task context is too long" });
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
			return fail(llmErrorStatus(err), { error: llmErrorMessage(err) });
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
		if (sourceExpression.length > TRANSLATION_HELP_TEXT_MAX_LENGTH || userTranslation.length > TRANSLATION_HELP_TEXT_MAX_LENGTH) {
			return fail(400, { error: "Translation help text is too long" });
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
			return fail(llmErrorStatus(err), { error: llmErrorMessage(err) });
		}
	},
};
