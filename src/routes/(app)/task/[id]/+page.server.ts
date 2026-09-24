import { error, fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { LANGUAGE_CODES, type LanguageCode, PRACTICE_UI_TEXT_MAX_LENGTH, UI_VARIANT_LABELS } from "$lib/constants";
import { QUEST_HALL_DEPENDENCY } from "$lib/quest-hall/navigation";
import { requireUser } from "$lib/server/auth/authz";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { db } from "$lib/server/db";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import { loadQuestHallData } from "$lib/server/quest-hall";
import { questHallDetails } from "$lib/server/quest-hall-details";
import { getTaskIdentity, parseTaskId, resolveRequestLineup, type TaskIdentity } from "$lib/server/task-context";
import { getTaskPreparationData } from "$lib/server/task-preparation";
import { evaluateUserTranslation, generateExpressions } from "$lib/server/translate";
import { getOrCreateTranslationAttempt, getOrCreateTranslationSourceSet } from "$lib/server/translation";
import { getTranslationPreparationData, validPromptLanguage } from "$lib/server/translation-preparation";
import { abandonTranslationAttempt, findTranslationAttempt, getTranslationTask, TranslationWorkflowError } from "$lib/server/translation-workflow";
import { type AttemptContext, lineupQuery } from "$lib/task-attempts";
import type { Actions, PageServerLoad } from "./$types";

const TRANSLATION_HELP_TEXT_MAX_LENGTH = PRACTICE_UI_TEXT_MAX_LENGTH;

/** Validate and cast a language code, defaulting to "en" */
function validateLanguageCode(code: unknown): LanguageCode {
	if (typeof code === "string" && (LANGUAGE_CODES as readonly string[]).includes(code)) {
		return code as LanguageCode;
	}
	return "en";
}

async function requireTask(params: { id: string }, kind?: TaskIdentity["interactionType"]): Promise<TaskIdentity> {
	const taskId = parseTaskId(params.id);
	const identity = taskId ? await getTaskIdentity(taskId) : null;
	if (!identity || (kind && identity.interactionType !== kind)) throw error(404, "Task not found");
	return identity;
}

export const load: PageServerLoad = async (event) => {
	event.depends?.(QUEST_HALL_DEPENDENCY);
	const user = requireUser(event);
	const identity = await requireTask(event.params);
	const context = await resolveRequestLineup(event, identity);
	const hall = await loadQuestHallData(user, getBrowserTimezone(event.cookies));

	if (identity.interactionType === "translate") {
		const data = await getTranslationPreparationData({
			userId: user.id,
			taskId: identity.id,
			context,
			activeLanguage: user.activeLanguage as LanguageCode,
			nativeLanguage: user.nativeLanguage,
		});
		if (!data) throw error(404, "Task not found");
		return { kind: "translation" as const, ...data, ...questHallDetails(hall, { kind: "translation", key: `translation-${identity.id}`, data }) };
	}

	const data = await getTaskPreparationData({ userId: user.id, taskId: identity.id, context });
	if (!data) throw error(404, "Task not found");
	return { kind: "quest" as const, ...data, ...questHallDetails(hall, { kind: "quest", key: `daily-${identity.id}`, data }) };
};

async function translationContext(event: Parameters<Actions[string]>[0]) {
	const user = requireUser(event);
	const identity = await requireTask(event.params as { id: string }, "translate");
	const task = await getTranslationTask(identity.id, user.activeLanguage);
	if (!task) throw error(404, "Task not found");
	if (!validPromptLanguage(user.nativeLanguage)) return { failure: fail(400, { error: "Set your native language before starting." }) };
	if (user.nativeLanguage === task.language) return { failure: fail(400, { error: "Your native and learning languages must be different." }) };
	const context = await resolveRequestLineup(event, identity);
	return { user, task, promptLanguage: user.nativeLanguage, context };
}

async function prepareTranslationAttempt(input: {
	userId: string;
	task: NonNullable<Awaited<ReturnType<typeof getTranslationTask>>>;
	promptLanguage: string;
	context: AttemptContext;
}) {
	if (!input.task.referenceParagraphs?.length || !input.task.context?.trim())
		throw new TranslationWorkflowError(404, "Translation task is incomplete.");
	const sourceSet = await getOrCreateTranslationSourceSet({
		userId: input.userId,
		taskId: input.task.id,
		referenceParagraphs: input.task.referenceParagraphs,
		context: input.task.context,
		sourceLanguage: input.task.language,
		promptLanguage: input.promptLanguage,
	});
	return getOrCreateTranslationAttempt({ userId: input.userId, sourceSet, lineupId: input.context.lineupId });
}

export const actions: Actions = {
	/** Opens (or resumes) the first draft of a translation task. */
	start: async (event) => {
		const context = await translationContext(event);
		if ("failure" in context) return context.failure;
		try {
			await prepareTranslationAttempt({ userId: context.user.id, ...context });
		} catch (cause) {
			return fail(cause instanceof TranslationWorkflowError ? cause.status : llmErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
		throw redirect(303, `${base}/task/${context.task.id}/translation${lineupQuery(event.url)}`);
	},

	/** Discards an unfinished translation attempt, or starts over after a completed one. */
	retake: async (event) => {
		const context = await translationContext(event);
		if ("failure" in context) return context.failure;
		const existing = await findTranslationAttempt({
			userId: context.user.id,
			taskId: context.task.id,
			promptLanguage: context.promptLanguage,
			context: context.context,
		});
		try {
			if (existing && existing.workflowPhase !== "completed") await abandonTranslationAttempt(existing);
			await prepareTranslationAttempt({ userId: context.user.id, ...context });
		} catch (cause) {
			return fail(cause instanceof TranslationWorkflowError ? cause.status : llmErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
		throw redirect(303, `${base}/task/${context.task.id}/translation${lineupQuery(event.url)}`);
	},

	/** Generate 2-3 useful expressions for a practice task in the user's native language */
	generateExpressions: async (event) => {
		const user = requireUser(event);
		const identity = await requireTask(event.params, "chat");
		if (!user.nativeLanguage?.trim()) {
			return fail(400, { error: "Please set your native language in your profile before using translation help." });
		}
		const task = await db.query.task.findFirst({
			where: (tasks, { eq }) => eq(tasks.id, identity.id),
			columns: { title: true, description: true, objectives: true, ui: true, language: true },
		});
		if (!task) throw error(404, "Task not found");

		try {
			const expressions = await generateExpressions(
				{
					title: task.title,
					description: task.description,
					objectives: task.objectives,
					uiLabel: UI_VARIANT_LABELS[task.ui],
				},
				user.nativeLanguage,
				task.language,
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
