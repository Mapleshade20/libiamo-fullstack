/**
 * The post-task transfer pass, shared by translation attempts and practice sessions.
 *
 * Both task types end with the same card pass over the notes they produced, so the queue, the card
 * UI, and the rating contract have one implementation. What stays separate lives with each
 * workflow: translation's correction and second-draft phases, and practice's note-from-selection
 * creation.
 */

import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "./db";
import { note, practiceSession } from "./db/schema";
import { rateNote, studyQueueKind } from "./review";
import { observeReviewQueue } from "./streak";

export type TransferSource = { type: "practice"; sessionId: number } | { type: "translation"; attemptId: number };

export class TransferError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "TransferError";
	}
}

function sourceFilter(source: TransferSource) {
	return source.type === "practice" ? eq(note.sourceSessionId, source.sessionId) : eq(note.sourceTranslationAttemptId, source.attemptId);
}

export async function listTransferNotes(userId: string, source: TransferSource) {
	const rows = await db.query.note.findMany({
		where: and(eq(note.userId, userId), sourceFilter(source)),
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

/**
 * Rate one card of a transfer pass.
 *
 * This is the single place that passes `outOfBand`, because a pass deliberately drills notes that
 * are not due yet, and the single place the streak's review observation is triggered for this path.
 * It takes the request's timezone for that reason alone.
 */
export async function rateTransferNote(input: {
	userId: string;
	source: TransferSource;
	noteId: number;
	rating: 1 | 3;
	elapsedSeconds: number;
	timeZone: string;
	now?: Date;
}) {
	const owned = await db.query.note.findFirst({
		where: and(eq(note.id, input.noteId), eq(note.userId, input.userId), sourceFilter(input.source)),
		columns: { id: true },
	});
	if (!owned) throw new TransferError(404, "Transfer note not found.");
	const now = input.now ?? new Date();
	const result = await rateNote(input.noteId, input.userId, input.rating, input.elapsedSeconds, { outOfBand: true, now });
	const streak = await observeReviewQueue(input.userId, now, input.timeZone);
	return { ...result, streak };
}

/**
 * Mark a practice session's pass as done. Idempotent per session: a repeat call is a no-op rather
 * than an error, because the client completes the pass from a queue it drained locally.
 */
export async function completePracticeTransfer(userId: string, sessionId: number, now = new Date()) {
	const [updated] = await db
		.update(practiceSession)
		.set({ transferCompletedAt: now })
		.where(
			and(
				eq(practiceSession.id, sessionId),
				eq(practiceSession.userId, userId),
				or(eq(practiceSession.status, "completed"), eq(practiceSession.status, "evaluated")),
				isNull(practiceSession.transferCompletedAt),
			),
		)
		.returning({ id: practiceSession.id });
	if (updated) return { completedAt: now };
	const existing = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, userId)),
		columns: { transferCompletedAt: true },
	});
	if (!existing?.transferCompletedAt) throw new TransferError(409, "This session's practice pass is not available.");
	return { completedAt: existing.transferCompletedAt };
}
