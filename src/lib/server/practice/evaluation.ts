/**
 * The practice session's evaluation page as a small state machine, the practice counterpart of
 * translation's `workflowPhase`.
 *
 * Ending the conversation no longer completes the quest: the learner works through every stage of
 * the evaluation page, ending with the shared card pass over the notes collected on it, and only the
 * guarded move to `completed` credits the streak. Each transition is a conditional update on the
 * phase it leaves, which is the fence that makes the credit exactly-once, so the claim and the
 * credit share one transaction.
 */

import { and, count, eq } from "drizzle-orm";
import type { PracticeEvaluationPhase } from "$lib/constants";
import { db } from "../db";
import { note, practiceSession } from "../db/schema";
import { TransferError } from "../review/transfer";
import { creditQuestCompletion } from "../streak";

async function claimPhase(userId: string, sessionId: number, from: PracticeEvaluationPhase, to: PracticeEvaluationPhase, timeZone: string) {
	const now = new Date();
	return db.transaction(async (transaction) => {
		const [claimed] = await transaction
			.update(practiceSession)
			.set(to === "completed" ? { evaluationPhase: to, evaluationCompletedAt: now } : { evaluationPhase: to })
			.where(
				and(
					eq(practiceSession.id, sessionId),
					eq(practiceSession.userId, userId),
					eq(practiceSession.status, "evaluated"),
					eq(practiceSession.evaluationPhase, from),
				),
			)
			.returning({ id: practiceSession.id });
		if (claimed && to === "completed") await creditQuestCompletion(transaction, userId, now, timeZone);
		return !!claimed;
	});
}

async function currentPhase(userId: string, sessionId: number) {
	const session = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, userId)),
		columns: { evaluationPhase: true },
	});
	return session?.evaluationPhase ?? null;
}

/**
 * Leave the feedback stage. The notes collected so far are the pass's whole set; with none there is
 * nothing to drill and the evaluation completes right here, which makes this a quest completion
 * entry point too.
 */
export async function finishPracticeFeedback(userId: string, sessionId: number, timeZone: string): Promise<PracticeEvaluationPhase> {
	const [row] = await db
		.select({ total: count() })
		.from(note)
		.where(and(eq(note.userId, userId), eq(note.sourceSessionId, sessionId)));
	const next = (row?.total ?? 0) > 0 ? "transfer" : "completed";
	if (await claimPhase(userId, sessionId, "feedback", next, timeZone)) return next;
	throw new TransferError(409, "The evaluation changed in another tab. Reload to continue.");
}

/**
 * Finish the card pass. Idempotent once completed: the client completes from a queue it drained
 * locally, so a retried request after a lost response must not fail the learner's finished pass.
 */
export async function completePracticeTransfer(userId: string, sessionId: number, timeZone: string): Promise<void> {
	if (await claimPhase(userId, sessionId, "transfer", "completed", timeZone)) return;
	if ((await currentPhase(userId, sessionId)) === "completed") return;
	throw new TransferError(409, "This session's card practice is not available.");
}
