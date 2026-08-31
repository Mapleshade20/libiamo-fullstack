import { error, fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { base } from "$app/paths";
import type { EvaluationData } from "$lib/components/translate-evaluation/types";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { requireUser } from "$lib/server/auth/authz";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import {
	completeTranslationTransfer,
	enterTranslationTransfer,
	generateTranslationPractice,
	getTranslationPracticeNotes,
	rateTranslationTransferNote,
	verifyTranslationSecondDraft,
} from "$lib/server/translation-practice";
import {
	findTranslationAttempt,
	finishTranslationCorrections,
	getTranslationTemplate,
	hydrateTranslationEvaluation,
	regenerateTranslationEvaluation,
	retryTranslationEvaluation,
	TranslationWorkflowError,
	verifyTranslationCorrection,
} from "$lib/server/translation-workflow";
import type { Actions, PageServerLoad } from "./$types";

const CorrectionSchema = z.object({
	evaluatedAt: z.string().datetime(),
	cardOrdinal: z.coerce.number().int().nonnegative(),
	hintLevel: z.enum(["initial", "deeper"]),
	learnerRevision: z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH),
});
const SecondDraftSchema = z.object({
	evaluatedAt: z.string().datetime(),
	paragraphs: z.array(z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH)).min(1),
	cardOutcomes: z.array(z.object({ ordinal: z.number().int().nonnegative(), outcome: z.enum(["passed", "revealed"]) })),
});
const TransferRatingSchema = z.object({
	noteId: z.coerce.number().int().positive(),
	rating: z.coerce
		.number()
		.int()
		.refine((value) => value === 1 || value === 3),
	elapsedSeconds: z.coerce.number().int().nonnegative(),
});

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
	if (!user.nativeLanguage) throw redirect(303, `${base}/translate/${id}`);
	const attempt = await findTranslationAttempt({ userId: user.id, templateId: id, promptLanguage: user.nativeLanguage });
	if (!attempt) throw redirect(303, `${base}/translate/${id}`);
	return { user, id, template, attempt };
}

function evaluationData(
	hydrated: Awaited<ReturnType<typeof hydrateTranslationEvaluation>>,
	record: Awaited<ReturnType<typeof findTranslationAttempt>>,
): EvaluationData {
	if (!record) throw new TranslationWorkflowError(404, "Attempt not found");
	return {
		overallCommentary: hydrated.evaluation.overallCommentary,
		ratings: hydrated.evaluation.ratings,
		cards: hydrated.evaluation.cards.map((card) => ({
			ordinal: card.ordinal,
			sourceText: card.sourceText,
			originalAnswer: card.originalAnswer,
			initialHint: card.initialHint,
			deeperHint: card.deeperHint,
			referenceAnswer: card.referenceAnswer,
			referenceMarked: card.referenceMarkedParts,
			minimalAnswer: card.minimalAnswer,
			minimalDiff: card.minimalDiffParts,
			teacherNotes: card.teacherNotes,
			warnings: card.warnings,
		})),
		firstDraft: hydrated.answers.map((answer) => answer.translation).join("\n\n"),
		firstDraftParagraphs: hydrated.answers.map((answer) => answer.translation),
		sourceParagraphs: hydrated.answers.map((answer) => record.candidates[answer.paragraphIndex][answer.candidateIndex]),
	};
}

export const load: PageServerLoad = async (event) => {
	const { id, template, attempt } = await routeContext(event);
	if (attempt.workflowPhase === "draft") throw redirect(303, `${base}/translate/${id}/attempt`);
	const hydrated = attempt.evaluation ? await hydrateTranslationEvaluation(attempt) : null;
	const practiceNotes = attempt.practiceGeneratedAt ? await getTranslationPracticeNotes(attempt) : [];
	return {
		template,
		attempt: {
			id: attempt.id,
			workflowPhase: attempt.workflowPhase,
			evaluatedAt: attempt.evaluatedAt?.toISOString() ?? null,
			practiceGeneratedAt: attempt.practiceGeneratedAt?.toISOString() ?? null,
		},
		evaluation: hydrated ? evaluationData(hydrated, attempt) : null,
		practiceNotes,
	};
};

function actionFailure(cause: unknown) {
	return fail(cause instanceof TranslationWorkflowError ? cause.status : llmErrorStatus(cause), { error: llmErrorMessage(cause) });
}

export const actions: Actions = {
	retryEvaluation: async (event) => {
		const { attempt } = await routeContext(event);
		try {
			const result = await retryTranslationEvaluation(attempt);
			return { success: true, evaluatedAt: result.evaluatedAt?.toISOString() };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	regenerate: async (event) => {
		const { attempt } = await routeContext(event);
		try {
			const result = await regenerateTranslationEvaluation(attempt);
			return { success: true, evaluatedAt: result.evaluatedAt?.toISOString() };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	verifyCorrection: async (event) => {
		const { attempt } = await routeContext(event);
		const form = await event.request.formData();
		const parsed = CorrectionSchema.safeParse(Object.fromEntries(form));
		if (!parsed.success) return fail(400, { error: "Invalid correction attempt." });
		try {
			return { success: true, verification: await verifyTranslationCorrection({ record: attempt, ...parsed.data }) };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	finishCorrections: async (event) => {
		const { attempt } = await routeContext(event);
		const evaluatedAt = (await event.request.formData()).get("evaluatedAt");
		if (typeof evaluatedAt !== "string") return fail(400, { error: "Evaluation version is required." });
		try {
			return { success: true, workflowPhase: await finishTranslationCorrections(attempt, evaluatedAt) };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	generatePractice: async (event) => {
		const { attempt } = await routeContext(event);
		const evaluatedAt = (await event.request.formData()).get("evaluatedAt");
		if (typeof evaluatedAt !== "string") return fail(400, { error: "Evaluation version is required." });
		try {
			const notes = await generateTranslationPractice(attempt, evaluatedAt);
			return { success: true, noteCount: notes.length };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	verifySecondDraft: async (event) => {
		const { attempt } = await routeContext(event);
		const form = await event.request.formData();
		let payload: unknown;
		try {
			payload = JSON.parse(String(form.get("payload")));
		} catch {
			return fail(400, { error: "Invalid second draft." });
		}
		const parsed = SecondDraftSchema.safeParse(payload);
		if (!parsed.success) return fail(400, { error: "Complete every second-draft paragraph." });
		try {
			return { success: true, verification: await verifyTranslationSecondDraft({ record: attempt, ...parsed.data }) };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	enterTransfer: async (event) => {
		const { attempt } = await routeContext(event);
		const evaluatedAt = (await event.request.formData()).get("evaluatedAt");
		if (typeof evaluatedAt !== "string") return fail(400, { error: "Evaluation version is required." });
		try {
			await enterTranslationTransfer(attempt, evaluatedAt);
			return { success: true };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	rateTransfer: async (event) => {
		const { attempt } = await routeContext(event);
		const parsed = TransferRatingSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { error: "Invalid transfer rating." });
		try {
			return { success: true, result: await rateTranslationTransferNote({ record: attempt, ...parsed.data, rating: parsed.data.rating as 1 | 3 }) };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	completeTransfer: async (event) => {
		const { attempt } = await routeContext(event);
		try {
			await completeTranslationTransfer(attempt);
			return { success: true };
		} catch (cause) {
			return actionFailure(cause);
		}
	},
};
