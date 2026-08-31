import { error, fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { NATIVE_LANGUAGE_CODES } from "$lib/constants";
import { requireUser } from "$lib/server/auth/authz";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import { getOrCreateTranslationAttempt, getOrCreateTranslationSourceSet } from "$lib/server/translation";
import {
	abandonTranslationAttempt,
	findTranslationAttempt,
	getTranslationTemplate,
	TranslationWorkflowError,
} from "$lib/server/translation-workflow";
import type { Actions, PageServerLoad } from "./$types";

function parseTemplateId(value: string) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

function validPromptLanguage(value: unknown): value is string {
	return typeof value === "string" && NATIVE_LANGUAGE_CODES.includes(value as (typeof NATIVE_LANGUAGE_CODES)[number]);
}

async function context(event: { locals: App.Locals; params: { id: string } }) {
	const user = requireUser(event);
	const templateId = parseTemplateId(event.params.id);
	if (!templateId) throw error(404, "Template not found");
	const template = await getTranslationTemplate(templateId, user.activeLanguage);
	if (!template) throw error(404, "Translation template not found");
	return { user, templateId, template };
}

async function prepareAttempt(input: {
	userId: string;
	templateId: number;
	promptLanguage: string;
	template: Awaited<ReturnType<typeof getTranslationTemplate>>;
}) {
	if (!input.template?.translationReference?.length || !input.template.context?.trim())
		throw new TranslationWorkflowError(404, "Translation template is incomplete.");
	const sourceSet = await getOrCreateTranslationSourceSet({
		userId: input.userId,
		templateId: input.templateId,
		referenceParagraphs: input.template.translationReference,
		context: input.template.context,
		sourceLanguage: input.template.language,
		promptLanguage: input.promptLanguage,
	});
	return getOrCreateTranslationAttempt(input.userId, sourceSet.id, sourceSet.candidates.length);
}

export const load: PageServerLoad = async (event) => {
	const { user, templateId, template } = await context(event);
	const promptLanguage = user.nativeLanguage;
	let blockedReason: "missing-native-language" | "same-language" | null = null;
	if (!validPromptLanguage(promptLanguage)) blockedReason = "missing-native-language";
	else if (promptLanguage === template.language) blockedReason = "same-language";
	const attempt = blockedReason || !promptLanguage ? null : await findTranslationAttempt({ userId: user.id, templateId, promptLanguage });
	return {
		template,
		blockedReason,
		attempt: attempt ? { id: attempt.id, workflowPhase: attempt.workflowPhase } : null,
	};
};

export const actions: Actions = {
	start: async (event) => {
		const { user, templateId, template } = await context(event);
		if (!validPromptLanguage(user.nativeLanguage)) return fail(400, { error: "Set your native language before starting." });
		if (user.nativeLanguage === template.language) return fail(400, { error: "Your native and learning languages must be different." });
		try {
			await prepareAttempt({ userId: user.id, templateId, promptLanguage: user.nativeLanguage, template });
		} catch (cause) {
			return fail(cause instanceof TranslationWorkflowError ? cause.status : llmErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
		throw redirect(303, `${base}/translate/${templateId}/attempt`);
	},

	retake: async (event) => {
		const { user, templateId, template } = await context(event);
		if (!validPromptLanguage(user.nativeLanguage)) return fail(400, { error: "Set your native language before starting." });
		if (user.nativeLanguage === template.language) return fail(400, { error: "Your native and learning languages must be different." });
		const existing = await findTranslationAttempt({ userId: user.id, templateId, promptLanguage: user.nativeLanguage });
		try {
			if (existing && existing.workflowPhase !== "completed") await abandonTranslationAttempt(existing);
			await prepareAttempt({ userId: user.id, templateId, promptLanguage: user.nativeLanguage, template });
		} catch (cause) {
			return fail(cause instanceof TranslationWorkflowError ? cause.status : llmErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
		throw redirect(303, `${base}/translate/${templateId}/attempt`);
	},
};
