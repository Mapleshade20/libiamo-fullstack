import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { note, translationAttempt } from "$lib/server/db/schema";
import { insertNotes } from "$lib/server/note";
import { rateNote, studyQueueKind } from "$lib/server/review";
import { generateTranslationPractice as callGeneration2 } from "$lib/server/translation-evaluation/practice-generation";
import { verifySecondDraft } from "$lib/server/translation-evaluation/verifier";
import { hydrateTranslationEvaluation, type TranslationAttemptRecord, TranslationWorkflowError } from "$lib/server/translation-workflow";

function assertVersion(record: TranslationAttemptRecord, evaluatedAt: string) {
	if (!record.evaluatedAt || record.evaluatedAt.toISOString() !== evaluatedAt) {
		throw new TranslationWorkflowError(409, "The evaluation changed in another tab. Reload to continue.");
	}
}

export async function getTranslationPracticeNotes(record: TranslationAttemptRecord) {
	const rows = await db.query.note.findMany({
		where: and(eq(note.userId, record.userId), eq(note.sourceTranslationAttemptId, record.id)),
		columns: {
			id: true,
			vocab: true,
			targetDefinition: true,
			nativeDefinition: true,
			examples: true,
			fsrsCard: true,
		},
		orderBy: note.id,
	});
	return rows.map(({ fsrsCard, ...row }) => ({ ...row, queueKind: studyQueueKind(fsrsCard) }));
}

export async function generateTranslationPractice(record: TranslationAttemptRecord, evaluatedAt: string) {
	if (!record.evaluation || !record.feedbackLanguage || !["second_draft", "transfer"].includes(record.workflowPhase)) {
		throw new TranslationWorkflowError(409, "Practice cannot be generated from this phase.");
	}
	assertVersion(record, evaluatedAt);
	if (record.practiceGeneratedAt) return getTranslationPracticeNotes(record);
	const { evaluation } = await hydrateTranslationEvaluation(record);
	if (evaluation.cards.length === 0) throw new TranslationWorkflowError(409, "This evaluation has no correction cards.");
	const generated = await callGeneration2({
		cards: evaluation.cards,
		sourceLanguage: record.promptLanguage,
		targetLanguage: record.targetLanguage,
		userId: record.userId,
	});
	const now = new Date();
	const won = await db.transaction(async (transaction) => {
		const [claimed] = await transaction
			.update(translationAttempt)
			.set({ practiceGeneratedAt: now, updatedAt: now })
			.where(
				and(
					eq(translationAttempt.id, record.id),
					inArray(translationAttempt.workflowPhase, ["second_draft", "transfer"]),
					eq(translationAttempt.evaluatedAt, record.evaluatedAt as Date),
					sql`${translationAttempt.practiceGeneratedAt} IS NULL`,
				),
			)
			.returning({ id: translationAttempt.id });
		if (!claimed) return false;
		await insertNotes(transaction, {
			userId: record.userId,
			language: record.targetLanguage as typeof note.$inferInsert.language,
			source: { type: "translation", attemptId: record.id },
			notes: generated.value.notes,
		});
		return true;
	});
	if (!won) {
		const existing = await getTranslationPracticeNotes(record);
		if (existing.length > 0) return existing;
		throw new TranslationWorkflowError(409, "The evaluation changed while practice was being generated.");
	}
	return getTranslationPracticeNotes(record);
}

export async function verifyTranslationSecondDraft(input: {
	record: TranslationAttemptRecord;
	evaluatedAt: string;
	paragraphs: string[];
	cardOutcomes: Array<{ ordinal: number; outcome: "passed" | "revealed" }>;
}) {
	if (
		input.record.workflowPhase !== "second_draft" ||
		!input.record.evaluation ||
		!input.record.feedbackLanguage ||
		!input.record.generation1Messages
	) {
		throw new TranslationWorkflowError(409, "The second draft is not available.");
	}
	assertVersion(input.record, input.evaluatedAt);
	return (
		await verifySecondDraft({
			generation1History: input.record.generation1Messages.messages,
			secondDraftParagraphs: input.paragraphs,
			cardCount: input.record.evaluation.cards.length,
			cardOutcomes: input.cardOutcomes,
			targetLanguage: input.record.targetLanguage,
			feedbackLanguage: input.record.feedbackLanguage,
			userId: input.record.userId,
		})
	).value;
}

export async function enterTranslationTransfer(record: TranslationAttemptRecord, evaluatedAt: string) {
	if (record.workflowPhase !== "second_draft") throw new TranslationWorkflowError(409, "The attempt is not in the second-draft phase.");
	assertVersion(record, evaluatedAt);
	const now = new Date();
	const [updated] = await db
		.update(translationAttempt)
		.set({ workflowPhase: "transfer", generation1Messages: null, updatedAt: now })
		.where(
			and(
				eq(translationAttempt.id, record.id),
				eq(translationAttempt.workflowPhase, "second_draft"),
				eq(translationAttempt.evaluatedAt, record.evaluatedAt as Date),
			),
		)
		.returning({ id: translationAttempt.id });
	if (!updated) throw new TranslationWorkflowError(409, "The attempt changed in another tab. Reload to continue.");
}

export async function rateTranslationTransferNote(input: {
	record: TranslationAttemptRecord;
	noteId: number;
	rating: 1 | 3;
	elapsedSeconds: number;
}) {
	if (input.record.workflowPhase !== "transfer") throw new TranslationWorkflowError(409, "Transfer practice is not active.");
	const owned = await db.query.note.findFirst({
		where: and(eq(note.id, input.noteId), eq(note.userId, input.record.userId), eq(note.sourceTranslationAttemptId, input.record.id)),
		columns: { id: true },
	});
	if (!owned) throw new TranslationWorkflowError(404, "Transfer note not found.");
	return rateNote(input.noteId, input.record.userId, input.rating, input.elapsedSeconds);
}

export async function completeTranslationTransfer(record: TranslationAttemptRecord) {
	if (record.workflowPhase !== "transfer" || !record.practiceGeneratedAt) {
		throw new TranslationWorkflowError(409, "Transfer practice is not ready to complete.");
	}
	const now = new Date();
	const [updated] = await db
		.update(translationAttempt)
		.set({ workflowPhase: "completed", completedAt: now, updatedAt: now })
		.where(and(eq(translationAttempt.id, record.id), eq(translationAttempt.workflowPhase, "transfer")))
		.returning({ id: translationAttempt.id });
	if (!updated) throw new TranslationWorkflowError(409, "The attempt changed in another tab. Reload to continue.");
}
