import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { PRACTICE_UI_TEXT_MAX_LENGTH, TRANSLATION_CANDIDATE_COUNT } from "$lib/constants";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import { requireTranslationAttempt } from "$lib/server/translation-preparation";
import { getTranslationAnswers, submitTranslationAttempt, TranslationWorkflowError } from "$lib/server/translation-workflow";
import type { Actions, PageServerLoad } from "./$types";

const AnswersSchema = z.array(
	z.object({
		paragraphIndex: z.number().int().nonnegative(),
		translation: z.string().max(PRACTICE_UI_TEXT_MAX_LENGTH),
		candidateIndex: z
			.number()
			.int()
			.min(0)
			.max(TRANSLATION_CANDIDATE_COUNT - 1),
	}),
);

export const load: PageServerLoad = async (event) => {
	const { task, attempt, detailsPath, workflowPath, pin } = await requireTranslationAttempt(event);
	if (attempt.workflowPhase !== "draft") throw redirect(303, `${workflowPath}/feedback${pin}`);
	return {
		task,
		detailsPath,
		attempt: {
			id: attempt.id,
			promptLanguage: attempt.promptLanguage,
			candidates: attempt.candidates,
			answers: await getTranslationAnswers(attempt.id),
		},
	};
};

export const actions: Actions = {
	submit: async (event) => {
		const { user, attempt, workflowPath, pin } = await requireTranslationAttempt(event);
		if (attempt.workflowPhase !== "draft") return fail(409, { error: "This draft has already been submitted.", submitted: true });
		const form = await event.request.formData();
		const raw = form.get("answers");
		if (typeof raw !== "string" || raw.length > 100 * 1024) return fail(400, { error: "Invalid answer data." });
		let answers: z.infer<typeof AnswersSchema>;
		try {
			const parsed = AnswersSchema.safeParse(JSON.parse(raw));
			if (!parsed.success) return fail(400, { error: "Complete every paragraph before submitting." });
			answers = parsed.data;
		} catch {
			return fail(400, { error: "Invalid answer data." });
		}
		try {
			await submitTranslationAttempt({
				record: attempt,
				answers,
				feedbackLanguagePreference: user.feedbackLanguagePreference === "target" ? "target" : "native",
				nativeLanguage: user.nativeLanguage,
			});
		} catch (cause) {
			return fail(cause instanceof TranslationWorkflowError ? cause.status : llmErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
		throw redirect(303, `${workflowPath}/feedback${pin}`);
	},
};
