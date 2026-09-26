import { error, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import type { LanguageCode } from "$lib/constants";
import { NATIVE_LANGUAGE_CODES } from "$lib/constants";
import { requireUser } from "$lib/server/auth/authz";
import { parseTaskId, resolveRequestLineup } from "$lib/server/task/context";
import { findTranslationAttempt, getTranslationTask } from "$lib/server/translation/workflow";
import { type AttemptContext, lineupQuery } from "$lib/task/attempts";

export type TranslationPreparationBlockedReason = "missing-native-language" | "same-language" | null;

export interface TranslationPreparationData {
	task: NonNullable<Awaited<ReturnType<typeof getTranslationTask>>>;
	blockedReason: TranslationPreparationBlockedReason;
	attempt: { id: number; workflowPhase: string } | null;
}

interface TranslationPreparationInput {
	userId: string;
	taskId: number;
	context: AttemptContext;
	activeLanguage: LanguageCode;
	nativeLanguage: string | null | undefined;
}

export function validPromptLanguage(value: unknown): value is string {
	return typeof value === "string" && NATIVE_LANGUAGE_CODES.includes(value as (typeof NATIVE_LANGUAGE_CODES)[number]);
}

export async function getTranslationPreparationData({
	userId,
	taskId,
	context,
	activeLanguage,
	nativeLanguage,
}: TranslationPreparationInput): Promise<TranslationPreparationData | null> {
	const task = await getTranslationTask(taskId, activeLanguage);
	if (!task) return null;

	let blockedReason: TranslationPreparationBlockedReason = null;
	if (!validPromptLanguage(nativeLanguage)) blockedReason = "missing-native-language";
	else if (nativeLanguage === task.language) blockedReason = "same-language";

	const attempt = blockedReason || !nativeLanguage ? null : await findTranslationAttempt({ userId, taskId, promptLanguage: nativeLanguage, context });

	return {
		task,
		blockedReason,
		attempt: attempt ? { id: attempt.id, workflowPhase: attempt.workflowPhase } : null,
	};
}

/**
 * Shared context of the translation workflow pages: the task, the learner, and the attempt the URL
 * shows. Learners without an attempt are sent back to the task details.
 */
export async function requireTranslationAttempt(event: {
	locals: App.Locals;
	params: { id: string };
	url: URL;
	cookies: { get(name: string): string | undefined };
}) {
	const user = requireUser(event);
	const id = parseTaskId(event.params.id);
	const task = id ? await getTranslationTask(id, user.activeLanguage) : undefined;
	if (!task) throw error(404, "Task not found");
	const detailsPath = `${base}/task/${task.id}${lineupQuery(event.url)}`;
	if (!user.nativeLanguage) throw redirect(303, detailsPath);
	const context = await resolveRequestLineup(event, { id: task.id, interactionType: "translate", language: task.language });
	const attempt = await findTranslationAttempt({ userId: user.id, taskId: task.id, promptLanguage: user.nativeLanguage, context });
	if (!attempt) throw redirect(303, detailsPath);
	return { user, task, attempt, detailsPath, workflowPath: `${base}/task/${task.id}/translation`, pin: lineupQuery(event.url) };
}
