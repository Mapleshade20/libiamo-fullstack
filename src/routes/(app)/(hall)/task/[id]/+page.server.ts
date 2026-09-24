import { error, fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { getSelfAssignedLevel, type LanguageCode, PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { QUEST_HALL_DEPENDENCY } from "$lib/quest-hall/navigation";
import type { QuestHallPreparation } from "$lib/quest-hall/preparation";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import { getTaskPreparationData } from "$lib/server/practice/preparation";
import { evaluateUserTranslation, generateExpressions } from "$lib/server/practice/translation-help";
import { getTaskIdentity, parseTaskId, resolveRequestLineup, type TaskIdentity } from "$lib/server/task/context";
import { getTranslationPreparationData, validPromptLanguage } from "$lib/server/translation/preparation";
import { getOrCreateTranslationAttempt, getOrCreateTranslationSourceSet } from "$lib/server/translation/sources";
import { abandonTranslationAttempt, findTranslationAttempt, getTranslationTask, TranslationWorkflowError } from "$lib/server/translation/workflow";
import { type AttemptContext, lineupQuery } from "$lib/task/attempts";
import type { Actions, PageServerLoad } from "./$types";

const TRANSLATION_HELP_TEXT_MAX_LENGTH = PRACTICE_UI_TEXT_MAX_LENGTH;

async function requireTask(params: { id: string }, kind?: TaskIdentity["interactionType"]): Promise<TaskIdentity> {
	const taskId = parseTaskId(params.id);
	const identity = taskId ? await getTaskIdentity(taskId) : null;
	if (!identity || (kind && identity.interactionType !== kind)) throw error(404, "Task not found");
	return identity;
}

/** The chat task facts translation help prompts describe. */
async function loadTranslationHelpTask(taskId: number) {
	return db.query.task.findFirst({
		where: (tasks, { eq }) => eq(tasks.id, taskId),
		columns: {
			title: true,
			shortObjective: true,
			description: true,
			objectives: true,
			difficulty: true,
			ui: true,
			language: true,
			openingState: true,
		},
	});
}

/**
 * Only this task's preparation: the book data comes from the `(hall)` layout, and `+page.ts` places
 * the task in it. Calling `parent()` here would re-run that layout load on every visit.
 */
export const load: PageServerLoad = async (event) => {
	event.depends?.(QUEST_HALL_DEPENDENCY);
	const user = requireUser(event);
	const identity = await requireTask(event.params);
	const context = await resolveRequestLineup(event, identity);

	if (identity.interactionType === "translate") {
		const data = await getTranslationPreparationData({
			userId: user.id,
			taskId: identity.id,
			context,
			activeLanguage: user.activeLanguage as LanguageCode,
			nativeLanguage: user.nativeLanguage,
		});
		if (!data) throw error(404, "Task not found");
		return { preparation: { kind: "translation", key: `translation-${identity.id}`, data } satisfies QuestHallPreparation };
	}

	const data = await getTaskPreparationData({ userId: user.id, taskId: identity.id, context });
	if (!data) throw error(404, "Task not found");
	return { preparation: { kind: "quest", key: `daily-${identity.id}`, data } satisfies QuestHallPreparation };
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
		const task = await loadTranslationHelpTask(identity.id);
		if (!task) throw error(404, "Task not found");
		const learner = await db.query.user.findFirst({ where: (users, { eq }) => eq(users.id, user.id), columns: { levelSelfAssign: true } });

		try {
			const expressions = await generateExpressions(
				task,
				user.nativeLanguage,
				task.language,
				user.id,
				learner ? getSelfAssignedLevel(learner.levelSelfAssign, task.language) : null,
			);

			return { success: true, expressions };
		} catch (err) {
			return fail(llmErrorStatus(err), { error: llmErrorMessage(err) });
		}
	},

	/** Evaluate a user's translation attempt and return feedback + correction */
	evaluateTranslation: async (event) => {
		const user = requireUser(event);
		const identity = await requireTask(event.params, "chat");

		const formData = await event.request.formData();
		const sourceExpression = formData.get("sourceExpression");
		const userTranslation = formData.get("userTranslation");
		const nativeLang = user.nativeLanguage?.trim() || formData.get("nativeLanguage");

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

		const task = await loadTranslationHelpTask(identity.id);
		if (!task) throw error(404, "Task not found");

		try {
			const { feedback, correction } = await evaluateUserTranslation(
				sourceExpression.trim(),
				userTranslation.trim(),
				nativeLang,
				task.language,
				user.id,
				task,
			);

			return { success: true, feedback, correction };
		} catch (err) {
			return fail(llmErrorStatus(err), { error: llmErrorMessage(err) });
		}
	},
};
