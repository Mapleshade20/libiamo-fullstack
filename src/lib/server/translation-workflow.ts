import { and, desc, eq, ne, sql } from "drizzle-orm";
import { type FeedbackLanguageMode, type LanguageCode, resolveFeedbackLanguage } from "$lib/constants";
import { db } from "$lib/server/db";
import { type PersistedTranslationEvaluation, template, translationAnswer, translationAttempt, translationSourceSet } from "$lib/server/db/schema";
import type { ChatMessage } from "$lib/server/llm";
import { generateTranslationEvaluation } from "$lib/server/translation-evaluation/generation";
import { buildGeneration1Messages, type Generation1Input } from "$lib/server/translation-evaluation/prompt";
import { type ValidatedGeneration1Evaluation, validateGeneration1Evaluation } from "$lib/server/translation-evaluation/validation";
import { type ValidatedCorrectionVerification, verifyCorrection } from "$lib/server/translation-evaluation/verifier";

export const TRANSLATION_LLM_CALL_TOKEN_BUDGET = 40_000;
const GENERATION_1_COMPLETION_BUDGET = 32_768;

export class TranslationWorkflowError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "TranslationWorkflowError";
	}
}

export type TranslationAnswerInput = {
	paragraphIndex: number;
	translation: string;
	candidateIndex: number;
};

export type TranslationAttemptRecord = NonNullable<Awaited<ReturnType<typeof findTranslationAttempt>>>;

function estimateMessageTokens(messages: ChatMessage[]): number {
	const characters = messages.reduce((total, message) => total + message.role.length + message.content.length, 0);
	return Math.ceil(characters / 3) + messages.length * 4;
}

export function assertGeneration1CallFitsBudget(input: Generation1Input): void {
	const estimatedInputTokens = estimateMessageTokens(buildGeneration1Messages(input));
	if (estimatedInputTokens + GENERATION_1_COMPLETION_BUDGET > TRANSLATION_LLM_CALL_TOKEN_BUDGET) {
		throw new TranslationWorkflowError(413, "Your first draft is too long for a reliable evaluation. Shorten it before submitting.");
	}
}

export async function findTranslationAttempt(input: { userId: string; templateId: number; promptLanguage: string; activeOnly?: boolean }) {
	const filters = [
		eq(translationAttempt.userId, input.userId),
		eq(translationSourceSet.templateId, input.templateId),
		eq(translationSourceSet.promptLanguage, input.promptLanguage),
	];
	if (input.activeOnly) filters.push(ne(translationAttempt.workflowPhase, "completed"));

	const [record] = await db
		.select({
			id: translationAttempt.id,
			userId: translationAttempt.userId,
			sourceSetId: translationAttempt.sourceSetId,
			workflowPhase: translationAttempt.workflowPhase,
			evaluation: translationAttempt.evaluation,
			generation1Messages: translationAttempt.generation1Messages,
			feedbackLanguage: translationAttempt.feedbackLanguage,
			submittedAt: translationAttempt.submittedAt,
			evaluatedAt: translationAttempt.evaluatedAt,
			practiceGeneratedAt: translationAttempt.practiceGeneratedAt,
			completedAt: translationAttempt.completedAt,
			updatedAt: translationAttempt.updatedAt,
			candidates: translationSourceSet.candidates,
			referenceParagraphs: translationSourceSet.referenceParagraphs,
			context: translationSourceSet.context,
			targetLanguage: translationSourceSet.sourceLanguage,
			promptLanguage: translationSourceSet.promptLanguage,
		})
		.from(translationAttempt)
		.innerJoin(translationSourceSet, eq(translationAttempt.sourceSetId, translationSourceSet.id))
		.where(and(...filters))
		.orderBy(sql`${translationAttempt.workflowPhase} <> 'completed' DESC`, desc(translationAttempt.updatedAt), desc(translationAttempt.id))
		.limit(1);
	return record;
}

export async function getOwnedTranslationAttempt(attemptId: number, userId: string, templateId: number) {
	const [record] = await db
		.select({
			id: translationAttempt.id,
			userId: translationAttempt.userId,
			sourceSetId: translationAttempt.sourceSetId,
			workflowPhase: translationAttempt.workflowPhase,
			evaluation: translationAttempt.evaluation,
			generation1Messages: translationAttempt.generation1Messages,
			feedbackLanguage: translationAttempt.feedbackLanguage,
			submittedAt: translationAttempt.submittedAt,
			evaluatedAt: translationAttempt.evaluatedAt,
			practiceGeneratedAt: translationAttempt.practiceGeneratedAt,
			completedAt: translationAttempt.completedAt,
			updatedAt: translationAttempt.updatedAt,
			candidates: translationSourceSet.candidates,
			referenceParagraphs: translationSourceSet.referenceParagraphs,
			context: translationSourceSet.context,
			targetLanguage: translationSourceSet.sourceLanguage,
			promptLanguage: translationSourceSet.promptLanguage,
		})
		.from(translationAttempt)
		.innerJoin(translationSourceSet, eq(translationAttempt.sourceSetId, translationSourceSet.id))
		.where(and(eq(translationAttempt.id, attemptId), eq(translationAttempt.userId, userId), eq(translationSourceSet.templateId, templateId)))
		.limit(1);
	return record;
}

export async function getTranslationAnswers(attemptId: number) {
	return db
		.select({
			paragraphIndex: translationAnswer.paragraphIndex,
			translation: translationAnswer.translation,
			candidateIndex: translationAnswer.candidateIndex,
		})
		.from(translationAnswer)
		.where(eq(translationAnswer.attemptId, attemptId))
		.orderBy(translationAnswer.paragraphIndex);
}

function normalizedCompleteAnswers(answers: TranslationAnswerInput[], candidates: string[][]): TranslationAnswerInput[] {
	if (answers.length !== candidates.length) throw new TranslationWorkflowError(400, "Complete every paragraph before submitting.");
	const ordered = [...answers].sort((left, right) => left.paragraphIndex - right.paragraphIndex);
	for (const [index, answer] of ordered.entries()) {
		if (
			answer.paragraphIndex !== index ||
			!answer.translation.trim() ||
			!Number.isInteger(answer.candidateIndex) ||
			answer.candidateIndex < 0 ||
			answer.candidateIndex >= candidates[index].length
		) {
			throw new TranslationWorkflowError(400, "Complete every paragraph with a valid prompt version before submitting.");
		}
	}
	return ordered.map((answer) => ({ ...answer, translation: answer.translation.trim() }));
}

function generationInput(record: TranslationAttemptRecord, answers: TranslationAnswerInput[], feedbackLanguage: string): Generation1Input {
	return {
		sourceParagraphs: answers.map((answer) => record.candidates[answer.paragraphIndex][answer.candidateIndex]),
		learnerParagraphs: answers.map((answer) => answer.translation),
		referenceParagraphs: record.referenceParagraphs,
		sourceLanguage: record.promptLanguage,
		targetLanguage: record.targetLanguage,
		feedbackLanguage,
		context: record.context,
	};
}

function persistedEvaluation(evaluation: ValidatedGeneration1Evaluation): PersistedTranslationEvaluation {
	return {
		overallCommentary: evaluation.overallCommentary,
		ratings: evaluation.ratings,
		cards: evaluation.cards.map(
			({
				ordinal: _ordinal,
				sourceRange: _sourceRange,
				answerRange: _answerRange,
				minimalDiffParts: _diff,
				referenceMarkedParts: _marked,
				...card
			}) => card,
		),
	};
}

async function persistGeneratedEvaluation(input: {
	attemptId: number;
	expectedPhase: "submitted" | "correction";
	expectedEvaluatedAt?: Date | null;
	evaluation: ValidatedGeneration1Evaluation;
	history: ChatMessage[];
}) {
	const evaluatedAt = new Date();
	const filters = [eq(translationAttempt.id, input.attemptId), eq(translationAttempt.workflowPhase, input.expectedPhase)];
	if (input.expectedPhase === "correction") {
		filters.push(sql`${translationAttempt.practiceGeneratedAt} IS NULL`);
		filters.push(
			input.expectedEvaluatedAt ? eq(translationAttempt.evaluatedAt, input.expectedEvaluatedAt) : sql`${translationAttempt.evaluatedAt} IS NULL`,
		);
	}
	const [updated] = await db
		.update(translationAttempt)
		.set({
			workflowPhase: "correction",
			evaluation: persistedEvaluation(input.evaluation),
			generation1Messages: { messages: input.history },
			evaluatedAt,
			updatedAt: evaluatedAt,
		})
		.where(and(...filters))
		.returning({ evaluatedAt: translationAttempt.evaluatedAt });
	if (!updated) throw new TranslationWorkflowError(409, "The evaluation changed in another tab. Reload to continue.");
	return updated.evaluatedAt;
}

async function runGeneration1(record: TranslationAttemptRecord, answers: TranslationAnswerInput[], feedbackLanguage: string) {
	const input = generationInput(record, answers, feedbackLanguage);
	const response = await generateTranslationEvaluation({ ...input, userId: record.userId });
	return { input, response };
}

export async function submitTranslationAttempt(input: {
	record: TranslationAttemptRecord;
	answers: TranslationAnswerInput[];
	feedbackLanguagePreference: FeedbackLanguageMode;
	nativeLanguage?: string | null;
}) {
	if (input.record.workflowPhase !== "draft") throw new TranslationWorkflowError(409, "This draft has already been submitted.");
	const answers = normalizedCompleteAnswers(input.answers, input.record.candidates);
	const feedbackLanguage = resolveFeedbackLanguage({
		preference: input.feedbackLanguagePreference,
		nativeLanguage: input.nativeLanguage,
		targetLanguage: input.record.targetLanguage as LanguageCode,
	});
	const generation = generationInput(input.record, answers, feedbackLanguage);
	assertGeneration1CallFitsBudget(generation);

	const submittedAt = new Date();
	await db.transaction(async (tx) => {
		const [claimed] = await tx
			.update(translationAttempt)
			.set({ workflowPhase: "submitted", feedbackLanguage, submittedAt, updatedAt: submittedAt })
			.where(and(eq(translationAttempt.id, input.record.id), eq(translationAttempt.workflowPhase, "draft")))
			.returning({ id: translationAttempt.id });
		if (!claimed) throw new TranslationWorkflowError(409, "This draft is no longer editable.");
		for (const answer of answers) {
			const [saved] = await tx
				.update(translationAnswer)
				.set({ translation: answer.translation, candidateIndex: answer.candidateIndex, updatedAt: submittedAt })
				.where(and(eq(translationAnswer.attemptId, input.record.id), eq(translationAnswer.paragraphIndex, answer.paragraphIndex)))
				.returning({ paragraphIndex: translationAnswer.paragraphIndex });
			if (!saved) throw new TranslationWorkflowError(409, "A draft paragraph is missing. Reload and try again.");
		}
	});

	return { submittedAt, feedbackLanguage };
}

export async function retryTranslationEvaluation(record: TranslationAttemptRecord) {
	if (record.workflowPhase !== "submitted" || !record.feedbackLanguage) {
		throw new TranslationWorkflowError(409, "This attempt is not awaiting evaluation.");
	}
	const answers = normalizedCompleteAnswers(await getTranslationAnswers(record.id), record.candidates);
	const input = generationInput(record, answers, record.feedbackLanguage);
	assertGeneration1CallFitsBudget(input);
	const { response } = await runGeneration1(record, answers, record.feedbackLanguage);
	const evaluatedAt = await persistGeneratedEvaluation({
		attemptId: record.id,
		expectedPhase: "submitted",
		evaluation: response.value,
		history: response.history,
	});
	return { evaluation: response.value, evaluatedAt };
}

export async function regenerateTranslationEvaluation(record: TranslationAttemptRecord) {
	if (record.workflowPhase !== "correction" || !record.feedbackLanguage || !record.evaluation || !record.evaluatedAt) {
		throw new TranslationWorkflowError(409, "This evaluation cannot be regenerated.");
	}
	if (record.practiceGeneratedAt) throw new TranslationWorkflowError(409, "Practice has already been generated for this evaluation.");
	const answers = normalizedCompleteAnswers(await getTranslationAnswers(record.id), record.candidates);
	const input = generationInput(record, answers, record.feedbackLanguage);
	assertGeneration1CallFitsBudget(input);
	const { response } = await runGeneration1(record, answers, record.feedbackLanguage);
	const evaluatedAt = await persistGeneratedEvaluation({
		attemptId: record.id,
		expectedPhase: "correction",
		expectedEvaluatedAt: record.evaluatedAt,
		evaluation: response.value,
		history: response.history,
	});
	return { evaluation: response.value, evaluatedAt };
}

export async function hydrateTranslationEvaluation(record: TranslationAttemptRecord) {
	if (!record.evaluation) throw new TranslationWorkflowError(409, "The evaluation is not available.");
	const answers = normalizedCompleteAnswers(await getTranslationAnswers(record.id), record.candidates);
	return {
		answers,
		evaluation: validateGeneration1Evaluation(record.evaluation, {
			sourceParagraphs: answers.map((answer) => record.candidates[answer.paragraphIndex][answer.candidateIndex]),
			learnerParagraphs: answers.map((answer) => answer.translation),
		}),
	};
}

export async function verifyTranslationCorrection(input: {
	record: TranslationAttemptRecord;
	evaluatedAt: string;
	cardOrdinal: number;
	hintLevel: "initial" | "deeper";
	learnerRevision: string;
}): Promise<ValidatedCorrectionVerification> {
	if (input.record.workflowPhase !== "correction" || !input.record.evaluatedAt || !input.record.feedbackLanguage) {
		throw new TranslationWorkflowError(409, "Corrections are not available for this attempt.");
	}
	if (input.record.evaluatedAt.toISOString() !== input.evaluatedAt) {
		throw new TranslationWorkflowError(409, "The evaluation changed in another tab. Reload to continue.");
	}
	const { evaluation } = await hydrateTranslationEvaluation(input.record);
	const card = evaluation.cards[input.cardOrdinal];
	if (!card || card.ordinal !== input.cardOrdinal) throw new TranslationWorkflowError(400, "Invalid correction card.");
	const response = await verifyCorrection({
		card,
		learnerRevision: input.learnerRevision,
		displayedHint: input.hintLevel === "initial" ? card.initialHint : card.deeperHint,
		targetLanguage: input.record.targetLanguage,
		feedbackLanguage: input.record.feedbackLanguage,
		userId: input.record.userId,
	});
	return response.value;
}

export async function finishTranslationCorrections(record: TranslationAttemptRecord, evaluatedAt: string) {
	if (record.workflowPhase !== "correction" || !record.evaluation || !record.evaluatedAt) {
		throw new TranslationWorkflowError(409, "Corrections cannot be finished from this phase.");
	}
	if (record.evaluatedAt.toISOString() !== evaluatedAt) {
		throw new TranslationWorkflowError(409, "The evaluation changed in another tab. Reload to continue.");
	}
	const hasCards = record.evaluation.cards.length > 0;
	const now = new Date();
	const [updated] = await db
		.update(translationAttempt)
		.set(
			hasCards
				? { workflowPhase: "second_draft", updatedAt: now }
				: { workflowPhase: "completed", generation1Messages: null, completedAt: now, updatedAt: now },
		)
		.where(
			and(
				eq(translationAttempt.id, record.id),
				eq(translationAttempt.workflowPhase, "correction"),
				eq(translationAttempt.evaluatedAt, record.evaluatedAt),
			),
		)
		.returning({ workflowPhase: translationAttempt.workflowPhase });
	if (!updated) throw new TranslationWorkflowError(409, "The attempt changed in another tab. Reload to continue.");
	return updated.workflowPhase;
}

export async function abandonTranslationAttempt(record: TranslationAttemptRecord) {
	if (record.workflowPhase === "completed") throw new TranslationWorkflowError(409, "Completed attempts cannot be abandoned.");
	const [deleted] = await db
		.delete(translationAttempt)
		.where(and(eq(translationAttempt.id, record.id), eq(translationAttempt.userId, record.userId), ne(translationAttempt.workflowPhase, "completed")))
		.returning({ id: translationAttempt.id });
	if (!deleted) throw new TranslationWorkflowError(409, "The attempt has already changed.");
}

export async function getTranslationTemplate(templateId: number, activeLanguage: string) {
	const [record] = await db
		.select({
			id: template.id,
			title: template.titleBase,
			description: template.descriptionBase,
			language: template.language,
			translationReference: template.translationReference,
			context: template.agentPromptBase,
			difficulty: template.difficulty,
			estimatedWords: template.estimatedWords,
			pointReward: template.pointReward,
			gemReward: template.gemReward,
		})
		.from(template)
		.where(
			and(
				eq(template.id, templateId),
				eq(template.interactionType, "translate"),
				eq(template.isActive, true),
				eq(template.language, activeLanguage as typeof template.$inferSelect.language),
			),
		)
		.limit(1);
	return record;
}
