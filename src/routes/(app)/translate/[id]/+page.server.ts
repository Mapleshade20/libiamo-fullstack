import { error, fail } from "@sveltejs/kit";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { type LanguageCode, NATIVE_LANGUAGE_CODES, PRACTICE_UI_TEXT_MAX_LENGTH, USER_LONG_TEXT_MAX_LENGTH } from "$lib/constants";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { template, translationAnswer, translationAttempt, translationSourceSet } from "$lib/server/db/schema";
import { followUpOnLearningContent } from "$lib/server/feedback";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import { createNoteFromSelectionQA, createNotesFromSelectionBatch } from "$lib/server/note";
import {
	evaluateTranslationAgainstReferences,
	getOrCreateTranslationAttempt,
	getOrCreateTranslationSourceSet,
	type TranslationEvaluation,
} from "$lib/server/translation";
import type { Actions, PageServerLoad } from "./$types";

const MAX_FORM_SIZE = 100 * 1024;

const AnswerPayloadSchema = z
	.array(
		z.object({
			paragraphIndex: z.number().int().nonnegative(),
			translation: z.string().max(PRACTICE_UI_TEXT_MAX_LENGTH),
			candidateIndex: z.number().int().min(0).max(2),
		}),
	)
	.max(1000);

type AnswerPayload = z.infer<typeof AnswerPayloadSchema>;

function templateIdFrom(value: string) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

function translateTemplateFilter(templateId: number, activeLanguage: string) {
	return and(
		eq(template.id, templateId),
		eq(template.interactionType, "translate"),
		eq(template.isActive, true),
		eq(template.language, activeLanguage as LanguageCode),
	);
}

function validPromptLanguage(value: unknown): value is string {
	return typeof value === "string" && NATIVE_LANGUAGE_CODES.includes(value as (typeof NATIVE_LANGUAGE_CODES)[number]);
}

function parseAttemptId(formData: FormData) {
	const value = Number(formData.get("attemptId"));
	return Number.isInteger(value) && value > 0 ? value : null;
}

function formText(formData: FormData, key: string) {
	const value = formData.get(key);
	return typeof value === "string" ? value.trim() : "";
}

function selectionTextIsValid(...values: string[]) {
	return values.every((value) => value.length <= USER_LONG_TEXT_MAX_LENGTH);
}

function parseAnswers(formData: FormData): { ok: true; answers: AnswerPayload; attemptId: number } | { ok: false; error: string } {
	const attemptId = parseAttemptId(formData);
	if (!attemptId) return { ok: false, error: "Invalid attempt ID" };
	const raw = formData.get("answers");
	if (typeof raw !== "string" || raw.length > MAX_FORM_SIZE) return { ok: false, error: "Invalid answer data" };
	try {
		const parsed = AnswerPayloadSchema.safeParse(JSON.parse(raw));
		if (!parsed.success) return { ok: false, error: "Invalid answer data" };
		return { ok: true, answers: parsed.data, attemptId };
	} catch {
		return { ok: false, error: "Invalid answer data" };
	}
}

async function getTemplate(templateId: number, activeLanguage: string) {
	const [tpl] = await db
		.select({
			id: template.id,
			title: template.titleBase,
			description: template.descriptionBase,
			language: template.language,
			materialsMd: template.materialsMd,
			translationReference: template.translationReference,
			context: template.agentPromptBase,
			difficulty: template.difficulty,
			estimatedWords: template.estimatedWords,
			pointReward: template.pointReward,
			gemReward: template.gemReward,
		})
		.from(template)
		.where(translateTemplateFilter(templateId, activeLanguage))
		.limit(1);
	return tpl;
}

async function getOwnedAttempt(attemptId: number, userId: string, templateId: number) {
	const [record] = await db
		.select({
			id: translationAttempt.id,
			status: translationAttempt.status,
			evaluation: translationAttempt.evaluation,
			sourceSetId: translationAttempt.sourceSetId,
			candidates: translationSourceSet.candidates,
			referenceParagraphs: translationSourceSet.referenceParagraphs,
			context: translationSourceSet.context,
			sourceLanguage: translationSourceSet.sourceLanguage,
			promptLanguage: translationSourceSet.promptLanguage,
		})
		.from(translationAttempt)
		.innerJoin(translationSourceSet, eq(translationAttempt.sourceSetId, translationSourceSet.id))
		.where(and(eq(translationAttempt.id, attemptId), eq(translationAttempt.userId, userId), eq(translationSourceSet.templateId, templateId)))
		.limit(1);
	return record;
}

function validateCompleteAnswers(answers: AnswerPayload, paragraphCount: number) {
	if (answers.length !== paragraphCount) return false;
	const ordered = [...answers].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
	return ordered.every((answer, index) => answer.paragraphIndex === index && answer.translation.trim().length > 0);
}

async function submitAnswers(attemptId: number, answers: AnswerPayload) {
	await db.transaction(async (tx) => {
		const [claimed] = await tx
			.update(translationAttempt)
			.set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
			.where(and(eq(translationAttempt.id, attemptId), eq(translationAttempt.status, "draft")))
			.returning({ id: translationAttempt.id });
		if (!claimed) throw new TranslationActionError(409, "Attempt is no longer editable");
		for (const answer of answers) {
			await tx
				.update(translationAnswer)
				.set({ translation: answer.translation.trim(), candidateIndex: answer.candidateIndex, updatedAt: new Date() })
				.where(and(eq(translationAnswer.attemptId, attemptId), eq(translationAnswer.paragraphIndex, answer.paragraphIndex)));
		}
	});
}

class TranslationActionError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "TranslationActionError";
	}
}

function actionErrorStatus(cause: unknown) {
	return cause instanceof TranslationActionError ? cause.status : llmErrorStatus(cause);
}

async function evaluateAttempt(attemptId: number, userId: string, templateId: number) {
	const record = await getOwnedAttempt(attemptId, userId, templateId);
	if (!record) throw new TranslationActionError(403, "Attempt not found or not owned by user");
	if (record.status !== "submitted") throw new TranslationActionError(409, "Attempt is not awaiting evaluation");
	const answers = await db
		.select({
			paragraphIndex: translationAnswer.paragraphIndex,
			translation: translationAnswer.translation,
			candidateIndex: translationAnswer.candidateIndex,
		})
		.from(translationAnswer)
		.where(eq(translationAnswer.attemptId, attemptId))
		.orderBy(translationAnswer.paragraphIndex);
	if (!validateCompleteAnswers(answers, record.candidates.length)) throw new TranslationActionError(409, "Attempt answers are incomplete");

	const evaluation = await evaluateTranslationAgainstReferences({
		promptParagraphs: answers.map((answer) => record.candidates[answer.paragraphIndex][answer.candidateIndex]),
		userTranslations: answers.map((answer) => answer.translation),
		referenceParagraphs: record.referenceParagraphs.map((reference) => [reference]),
		promptLanguage: record.promptLanguage,
		targetLanguage: record.sourceLanguage,
		context: record.context,
		feedbackLanguage: record.promptLanguage,
		userId,
	});
	await db
		.update(translationAttempt)
		.set({ status: "evaluated", evaluation, evaluatedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(translationAttempt.id, attemptId), eq(translationAttempt.status, "submitted")));
	return evaluation;
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const templateId = templateIdFrom(event.params.id);
	if (!templateId) throw error(404, "Template not found");
	const tpl = await getTemplate(templateId, user.activeLanguage);
	if (!tpl) throw error(404, "Translation template not found");

	const templateData = {
		id: tpl.id,
		title: tpl.title,
		description: tpl.description,
		language: tpl.language,
		materialsMd: tpl.materialsMd,
		difficulty: tpl.difficulty,
		estimatedWords: tpl.estimatedWords,
		pointReward: tpl.pointReward,
		gemReward: tpl.gemReward,
	};
	const promptLanguage = user.nativeLanguage;
	if (!validPromptLanguage(promptLanguage)) {
		return { template: templateData, promptLanguage: null, blockedReason: "missing-native-language", prepared: false, attempt: null };
	}
	if (promptLanguage === tpl.language) {
		return { template: templateData, promptLanguage, blockedReason: "same-language", prepared: false, attempt: null };
	}
	if (!tpl.translationReference?.length || !tpl.context?.trim()) throw error(404, "Translation template is incomplete");

	const [existingAttempt] = await db
		.select({
			id: translationAttempt.id,
			status: translationAttempt.status,
			evaluation: translationAttempt.evaluation,
			sourceSetId: translationSourceSet.id,
			candidates: translationSourceSet.candidates,
			referenceParagraphs: translationSourceSet.referenceParagraphs,
			context: translationSourceSet.context,
		})
		.from(translationAttempt)
		.innerJoin(translationSourceSet, eq(translationAttempt.sourceSetId, translationSourceSet.id))
		.where(
			and(
				eq(translationAttempt.userId, user.id),
				eq(translationSourceSet.templateId, templateId),
				eq(translationSourceSet.promptLanguage, promptLanguage),
			),
		)
		.orderBy(desc(translationAttempt.updatedAt))
		.limit(1);

	if (!existingAttempt) {
		return { template: templateData, promptLanguage, blockedReason: null, prepared: false, attempt: null };
	}

	const answers = await db
		.select({
			paragraphIndex: translationAnswer.paragraphIndex,
			translation: translationAnswer.translation,
			candidateIndex: translationAnswer.candidateIndex,
		})
		.from(translationAnswer)
		.where(eq(translationAnswer.attemptId, existingAttempt.id))
		.orderBy(translationAnswer.paragraphIndex);
	const revealReferences = existingAttempt.status !== "draft";
	return {
		template: templateData,
		promptLanguage,
		blockedReason: null,
		prepared: true,
		attempt: {
			id: existingAttempt.id,
			status: existingAttempt.status,
			evaluation: existingAttempt.evaluation as TranslationEvaluation | null,
			candidates: existingAttempt.candidates,
			context: existingAttempt.context,
			answers: answers.map((answer) => ({ ...answer, translation: revealReferences ? answer.translation : "" })),
			referenceParagraphs: revealReferences ? existingAttempt.referenceParagraphs : null,
		},
	};
};

export const actions: Actions = {
	prepare: async (event) => {
		const user = requireUser(event);
		const templateId = templateIdFrom(event.params.id);
		if (!templateId) return fail(400, { error: "Invalid template ID" });
		const tpl = await getTemplate(templateId, user.activeLanguage);
		if (!tpl) return fail(404, { error: "Template not found" });
		if (!validPromptLanguage(user.nativeLanguage)) return fail(400, { error: "Set your native language before starting." });
		if (user.nativeLanguage === tpl.language) return fail(400, { error: "Your native and learning languages must be different." });
		if (!tpl.translationReference?.length || !tpl.context?.trim()) return fail(404, { error: "Translation template is incomplete" });
		try {
			const sourceSet = await getOrCreateTranslationSourceSet({
				templateId,
				referenceParagraphs: tpl.translationReference,
				context: tpl.context,
				sourceLanguage: tpl.language,
				promptLanguage: user.nativeLanguage,
			});
			const attemptId = await getOrCreateTranslationAttempt(user.id, sourceSet.id, sourceSet.candidates.length);
			return { success: true, attemptId };
		} catch (cause) {
			return fail(llmErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
	},

	submit: async (event) => {
		const user = requireUser(event);
		const templateId = templateIdFrom(event.params.id);
		if (!templateId) return fail(400, { error: "Invalid template ID" });
		const parsed = parseAnswers(await event.request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		const record = await getOwnedAttempt(parsed.attemptId, user.id, templateId);
		if (!record) return fail(403, { error: "Attempt not found or not owned by user" });
		if (record.status !== "draft") return fail(409, { error: "Attempt has already been submitted" });
		if (!validateCompleteAnswers(parsed.answers, record.candidates.length)) {
			return fail(400, { error: "Complete every paragraph before submitting" });
		}
		try {
			await submitAnswers(parsed.attemptId, parsed.answers);
		} catch (cause) {
			return fail(actionErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
		try {
			const evaluation = await evaluateAttempt(parsed.attemptId, user.id, templateId);
			return { success: true, evaluation };
		} catch (cause) {
			return fail(actionErrorStatus(cause), { error: llmErrorMessage(cause), submitted: true });
		}
	},

	retryEvaluation: async (event) => {
		const user = requireUser(event);
		const templateId = templateIdFrom(event.params.id);
		if (!templateId) return fail(400, { error: "Invalid template ID" });
		const attemptId = parseAttemptId(await event.request.formData());
		if (!attemptId) return fail(400, { error: "Invalid attempt ID" });
		try {
			const evaluation = await evaluateAttempt(attemptId, user.id, templateId);
			return { success: true, evaluation };
		} catch (cause) {
			return fail(actionErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
	},

	askSelection: async (event) => {
		const user = requireUser(event);
		const templateId = templateIdFrom(event.params.id);
		if (!templateId) return fail(400, { error: "Invalid template ID" });
		const formData = await event.request.formData();
		const attemptId = parseAttemptId(formData);
		const selectedText = formText(formData, "selectedText");
		const question = formText(formData, "question");
		const currentContext = formText(formData, "currentContext");
		const previousContext = formText(formData, "previousContext");
		if (!attemptId || !selectedText || !question) return fail(400, { error: "Missing required fields" });
		if (selectedText.length > PRACTICE_UI_TEXT_MAX_LENGTH || question.length > PRACTICE_UI_TEXT_MAX_LENGTH) {
			return fail(400, { error: "Text is too long" });
		}
		if (!selectionTextIsValid(currentContext, previousContext)) return fail(400, { error: "Context is too long" });
		const record = await getOwnedAttempt(attemptId, user.id, templateId);
		if (!record) return fail(403, { error: "Attempt not found or not owned by user" });
		if (record.status !== "evaluated" || !record.evaluation) return fail(409, { error: "Evaluation is not available" });
		try {
			const result = await followUpOnLearningContent({
				userId: user.id,
				learningLanguage: record.sourceLanguage,
				responseLanguage: record.promptLanguage,
				itemText: selectedText,
				category: "grammar",
				question,
				currentContext,
				previousContext,
			});
			return { success: true, answer: result.answer };
		} catch (cause) {
			return fail(llmErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
	},

	saveSelectionNotes: async (event) => {
		const user = requireUser(event);
		const templateId = templateIdFrom(event.params.id);
		if (!templateId) return fail(400, { error: "Invalid template ID" });
		const formData = await event.request.formData();
		const attemptId = parseAttemptId(formData);
		const selectedText = formText(formData, "selectedText");
		const currentContext = formText(formData, "currentContext");
		const previousContext = formText(formData, "previousContext");
		const sourceKind = formText(formData, "sourceKind") || "translation feedback";
		if (!attemptId || !selectedText) return fail(400, { error: "Missing selected text" });
		if (!selectionTextIsValid(selectedText, currentContext, previousContext, sourceKind)) return fail(400, { error: "Text is too long" });
		const record = await getOwnedAttempt(attemptId, user.id, templateId);
		if (!record) return fail(403, { error: "Attempt not found or not owned by user" });
		if (record.status !== "evaluated" || !record.evaluation) return fail(409, { error: "Evaluation is not available" });
		try {
			const result = await createNotesFromSelectionBatch({
				userId: user.id,
				source: { type: "translation", attemptId },
				language: record.sourceLanguage,
				selectedText,
				currentContext,
				previousContext,
				sourceKind,
			});
			return { success: true, count: result.count, notes: result.notes, reason: result.reason };
		} catch (cause) {
			return fail(llmErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
	},

	saveSelectionQaNote: async (event) => {
		const user = requireUser(event);
		const templateId = templateIdFrom(event.params.id);
		if (!templateId) return fail(400, { error: "Invalid template ID" });
		const formData = await event.request.formData();
		const attemptId = parseAttemptId(formData);
		const selectedText = formText(formData, "selectedText");
		const surroundingContext = formText(formData, "surroundingContext");
		const question = formText(formData, "question");
		const answer = formText(formData, "answer");
		if (!attemptId || !selectedText || !question || !answer) return fail(400, { error: "Missing required fields" });
		if (!selectionTextIsValid(selectedText, surroundingContext, question, answer)) return fail(400, { error: "Text is too long" });
		const record = await getOwnedAttempt(attemptId, user.id, templateId);
		if (!record) return fail(403, { error: "Attempt not found or not owned by user" });
		if (record.status !== "evaluated" || !record.evaluation) return fail(409, { error: "Evaluation is not available" });
		try {
			const result = await createNoteFromSelectionQA({
				userId: user.id,
				source: { type: "translation", attemptId },
				selectedText,
				surroundingContext,
				question,
				answer,
				language: record.sourceLanguage,
			});
			return { success: true, note: result.note };
		} catch (cause) {
			return fail(llmErrorStatus(cause), { error: llmErrorMessage(cause) });
		}
	},
};
