import { error, fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { requireUser } from "$lib/server/auth/authz";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import {
	findTranslationAttempt,
	getTranslationAnswers,
	getTranslationTemplate,
	submitTranslationAttempt,
	TranslationWorkflowError,
} from "$lib/server/translation-workflow";
import type { Actions, PageServerLoad } from "./$types";

const AnswersSchema = z.array(
	z.object({
		paragraphIndex: z.number().int().nonnegative(),
		translation: z.string().max(PRACTICE_UI_TEXT_MAX_LENGTH),
		candidateIndex: z.number().int().min(0).max(2),
	}),
);

function templateId(value: string) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function routeContext(event: { locals: App.Locals; params: { id: string } }) {
	const user = requireUser(event);
	const id = templateId(event.params.id);
	if (!id) throw error(404, "Template not found");
	const template = await getTranslationTemplate(id, user.activeLanguage);
	if (!template) throw error(404, "Translation template not found");
	if (!user.nativeLanguage) throw redirect(303, `/translate/${id}`);
	const attempt = await findTranslationAttempt({ userId: user.id, templateId: id, promptLanguage: user.nativeLanguage });
	if (!attempt) throw redirect(303, `/translate/${id}`);
	return { user, id, template, attempt };
}

export const load: PageServerLoad = async (event) => {
	const { id, template, attempt } = await routeContext(event);
	if (attempt.workflowPhase !== "draft") throw redirect(303, `/translate/${id}/feedback`);
	return { template, attempt: { id: attempt.id, candidates: attempt.candidates, answers: await getTranslationAnswers(attempt.id) } };
};

export const actions: Actions = {
	submit: async (event) => {
		const { user, id, attempt } = await routeContext(event);
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
		throw redirect(303, `/translate/${id}/feedback`);
	},
};
