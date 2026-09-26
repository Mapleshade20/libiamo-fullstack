import { type AnyColumn, and, asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { PRACTICE_SESSION_MAX_AGE_SECONDS } from "$lib/constants";
import { getSessionExpiry, RE_ENGAGE_DELAY_MS, sampleReplyDelayMs } from "$lib/practice/reply-timing";
import { db } from "../db";
import { agentDelivery, agentResponseBatch, practiceSession, sessionMessage, task } from "../db/schema";

export const sessionMessageChronologicalOrder = [asc(sessionMessage.createdAt), asc(sessionMessage.id)];

export function orderSessionMessagesChronologically<T extends { createdAt: AnyColumn; id: AnyColumn }>(
	messages: T,
	operators: { asc: (column: AnyColumn) => SQL },
) {
	return [operators.asc(messages.createdAt), operators.asc(messages.id)];
}

/** Starts (or returns) the learner's session for a task within one lineup entry. */
export async function startSession(taskId: number, userId: string, lineupId: number | null): Promise<{ sessionId: number }> {
	const taskData = await db.query.task.findFirst({
		where: eq(task.id, taskId),
		columns: { interactionType: true },
	});
	if (!taskData || taskData.interactionType !== "chat") throw new Error("Task not found");

	const sameAttempt = and(
		eq(practiceSession.userId, userId),
		eq(practiceSession.taskId, taskId),
		lineupId === null ? isNull(practiceSession.lineupId) : eq(practiceSession.lineupId, lineupId),
	);
	const startedAt = new Date();
	const [session] = await db
		.insert(practiceSession)
		.values({
			userId,
			taskId,
			lineupId,
			startedAt,
			expiresAt: getSessionExpiry(startedAt, PRACTICE_SESSION_MAX_AGE_SECONDS),
			status: "in_progress",
		})
		.onConflictDoNothing()
		.returning({ id: practiceSession.id });
	if (session) return { sessionId: session.id };

	const existing = await db.query.practiceSession.findFirst({ where: sameAttempt, columns: { id: true } });
	if (!existing) throw new Error("Failed to create session");
	return { sessionId: existing.id };
}

type SubmitMessageResult =
	| { turnCount: number; pending: true }
	/** The send itself completed the session (e.g. the maxTurns message); clients must navigate instead of calling complete. */
	| { turnCount: number; pending: false; sessionCompleted: true; completionReason: "max_turns" };

type SessionMessageMetadata = {
	clientMessageId?: string;
	failed?: boolean;
	hidden?: boolean;
	displayContent?: string;
};

function getMessageMetadata(value: unknown): SessionMessageMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as SessionMessageMetadata;
}

function isHiddenUserMessage(message: { role: string; llmMetadata?: unknown }): boolean {
	return message.role === "user" && getMessageMetadata(message.llmMetadata).hidden === true;
}

function countVisibleUserTurns(messages: Array<{ role: string; llmMetadata?: unknown }>): number {
	return messages.filter((message) => message.role === "user" && !isHiddenUserMessage(message)).length;
}

export type SubmitMessageOptions = {
	userDisplayContent?: string;
	userMetadata?: Record<string, unknown>;
};

export async function submitMessage(
	sessionId: number,
	userMessage: string,
	userId: string,
	clientMessageId?: string,
	options: SubmitMessageOptions = {},
): Promise<SubmitMessageResult> {
	const trimmedUserMessage = userMessage.trim();
	if (!trimmedUserMessage) throw new Error("userMessage is required");
	const displayContent = options.userDisplayContent?.trim();
	const now = new Date();

	return db.transaction(async (tx) => {
		// Row lock that serializes concurrent submissions for the same session
		// (double send, retry, second tab): without it two transactions read the
		// same snapshot, both insert their learner message, both observe no active
		// batch, and both schedule one — duplicating messages and generated replies
		// and letting the turn count drift past maxTurns. Lock order here is
		// session -> batch -> delivery, matching the worker's delivery transaction.
		const [locked] = await tx
			.select({ id: practiceSession.id })
			.from(practiceSession)
			.where(and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, userId)))
			.for("update");
		if (!locked) throw new Error("Session not found");
		const session = await tx.query.practiceSession.findFirst({
			where: and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, userId)),
			with: {
				messages: { orderBy: sessionMessageChronologicalOrder },
				task: { columns: { urgency: true, maxTurns: true } },
			},
		});
		if (!session) throw new Error("Session not found");
		if (session.status !== "in_progress") throw new Error("Session not in progress");

		let revivedMessageId: number | null = null;
		if (clientMessageId) {
			const existing = session.messages.find(
				(message) => message.role === "user" && getMessageMetadata(message.llmMetadata).clientMessageId === clientMessageId,
			);
			if (existing) {
				if (getMessageMetadata(existing.llmMetadata).failed !== true) {
					return { turnCount: countVisibleUserTurns(session.messages), pending: true };
				}
				// A failed generation is terminal; a manual retry clears the failure and schedules a fresh batch.
				await tx
					.update(sessionMessage)
					.set({ llmMetadata: { ...getMessageMetadata(existing.llmMetadata), failed: false, failureError: null } })
					.where(eq(sessionMessage.id, existing.id));
				revivedMessageId = existing.id;
			}
		}

		let inputMessageId = revivedMessageId;
		if (!inputMessageId) {
			const inserted = await tx
				.insert(sessionMessage)
				.values({
					sessionId,
					role: "user",
					content: trimmedUserMessage,
					llmMetadata:
						clientMessageId || displayContent || options.userMetadata
							? {
									...options.userMetadata,
									clientMessageId,
									displayContent,
								}
							: undefined,
				})
				.returning({ id: sessionMessage.id });
			inputMessageId = inserted[0]?.id ?? null;
			if (!inputMessageId) throw new Error("Failed to persist message");
		}

		const turnCount = countVisibleUserTurns(session.messages) + (revivedMessageId !== null ? 0 : 1);
		const maxTurns = session.task.maxTurns;
		if (maxTurns && turnCount >= maxTurns) {
			await tx
				.update(practiceSession)
				.set({ status: "completed", completionReason: "max_turns", completedAt: now })
				.where(eq(practiceSession.id, sessionId));
			const activeBatches = await tx.query.agentResponseBatch.findMany({
				where: and(
					eq(agentResponseBatch.sessionId, sessionId),
					inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
				),
				columns: { id: true, status: true },
			});
			const nothingWillDeliver = !activeBatches.some((batch) => batch.status === "processing" || batch.status === "delivery_pending");
			// A session that never saw a single agent reply still gets one: its unclaimed
			// batch is spared so the reply arrives on the natural sampled clock, and when
			// nothing is scheduled at all (every batch failed or chose silence) a farewell
			// batch is queued right away.
			const neverReplied = !session.messages.some((message) => message.role === "assistant");
			const spareUnclaimed = neverReplied && nothingWillDeliver;
			const hasPending = activeBatches.some((batch) => batch.status === "pending");
			const cancelled = await tx
				.update(agentResponseBatch)
				.set({ status: "cancelled", completedAt: now })
				.where(
					and(
						eq(agentResponseBatch.sessionId, sessionId),
						inArray(agentResponseBatch.status, spareUnclaimed && hasPending ? ["stale"] : ["pending", "stale"]),
					),
				)
				.returning({ id: agentResponseBatch.id });
			// Replies the agent already composed (delivery_pending) or is still composing
			// (processing, held by a worker's claim fence) are left alive on purpose: the
			// turn limit ends the session, but the in-flight reply is still delivered
			// into it. Orphaned processing batches are cancelled later via lease reclaim.
			if (spareUnclaimed && !hasPending) {
				await tx.insert(agentResponseBatch).values({
					sessionId,
					kind: "reply",
					status: "pending",
					dueAt: new Date(now.getTime() + RE_ENGAGE_DELAY_MS),
					inputMessageId,
					inputVersion: 1,
				});
			}
			if (cancelled.length > 0) {
				await tx
					.update(agentDelivery)
					.set({ status: "cancelled" })
					.where(
						and(
							inArray(
								agentDelivery.batchId,
								cancelled.map((batch) => batch.id),
							),
							eq(agentDelivery.status, "pending"),
						),
					);
			}
			return { turnCount, pending: false, sessionCompleted: true, completionReason: "max_turns" };
		}

		const dueAt = new Date(now.getTime() + sampleReplyDelayMs(session.task.urgency ?? "high"));
		const activeBatch = await tx.query.agentResponseBatch.findFirst({
			where: and(
				eq(agentResponseBatch.sessionId, sessionId),
				inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
			),
		});
		if (activeBatch?.status === "delivery_pending") {
			// The agent had already composed a reply when the new message landed: it is
			// engaged, so re-engage quickly instead of restarting the full MTTH clock.
			const reEngageAt = new Date(now.getTime() + RE_ENGAGE_DELAY_MS);
			// The batch is cancelled before its deliveries so lock acquisition keeps
			// the session -> batch -> delivery order the delivery worker uses.
			await tx.update(agentResponseBatch).set({ status: "cancelled", completedAt: now }).where(eq(agentResponseBatch.id, activeBatch.id));
			await tx
				.update(agentDelivery)
				.set({ status: "cancelled" })
				.where(and(eq(agentDelivery.batchId, activeBatch.id), eq(agentDelivery.status, "pending")));
			await tx.insert(agentResponseBatch).values({
				sessionId,
				kind: "reply",
				status: "pending",
				dueAt: reEngageAt,
				inputMessageId,
				inputVersion: activeBatch.inputVersion + 1,
			});
		} else if (activeBatch && activeBatch.kind === "follow_up" && activeBatch.status !== "processing") {
			// The user came back before the idle nudge fired, so the silence condition
			// is gone: cancel the nudge and answer the new message on a fresh sampled
			// clock instead of folding into the idle batch's far-future due time.
			await tx.update(agentResponseBatch).set({ status: "cancelled", completedAt: now }).where(eq(agentResponseBatch.id, activeBatch.id));
			await tx.insert(agentResponseBatch).values({
				sessionId,
				kind: "reply",
				status: "pending",
				dueAt,
				inputMessageId,
				inputVersion: 1,
			});
		} else if (activeBatch) {
			// Additional messages in the same burst fold into the scheduled batch without
			// pushing its due time: the clock is anchored to the first message, so rapid
			// typing can never postpone the reply indefinitely.
			await tx
				.update(agentResponseBatch)
				.set({
					...(activeBatch.status === "processing" ? {} : { status: "pending" as const }),
					inputMessageId,
					inputVersion: activeBatch.inputVersion + 1,
				})
				.where(eq(agentResponseBatch.id, activeBatch.id));
		} else {
			await tx.insert(agentResponseBatch).values({
				sessionId,
				kind: "reply",
				status: "pending",
				dueAt,
				inputMessageId,
				inputVersion: 1,
			});
		}
		return { turnCount, pending: true };
	});
}

export async function completeSession(sessionId: number): Promise<void> {
	const now = new Date();
	await db.transaction(async (tx) => {
		// The status check and the write must share one locked view of the row: the
		// turn limit (submitMessage), the expiry sweep, and abuse termination all end
		// sessions concurrently. Reading outside the transaction let this overwrite
		// their outcome — relabelling a max_turns completion the worker reads to spare
		// its final reply, or resurrecting an already-abandoned session as completed.
		// Lock order is session -> batch -> delivery, matching submitMessage.
		const [locked] = await tx
			.select({ id: practiceSession.id, status: practiceSession.status })
			.from(practiceSession)
			.where(eq(practiceSession.id, sessionId))
			.for("update");
		if (!locked) throw new Error("Session not found");
		if (locked.status !== "in_progress") throw new Error("Session not in progress");

		const cancellable = await tx.query.agentResponseBatch.findMany({
			where: and(
				eq(agentResponseBatch.sessionId, sessionId),
				inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
			),
			columns: { id: true },
		});
		await tx
			.update(practiceSession)
			.set({ status: "completed", completionReason: "user_requested", completedAt: now })
			.where(eq(practiceSession.id, sessionId));
		await tx
			.update(agentResponseBatch)
			.set({ status: "cancelled", completedAt: now })
			.where(
				and(eq(agentResponseBatch.sessionId, sessionId), inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"])),
			);
		if (cancellable.length > 0) {
			await tx
				.update(agentDelivery)
				.set({ status: "cancelled" })
				.where(
					and(
						inArray(
							agentDelivery.batchId,
							cancellable.map((batch) => batch.id),
						),
						eq(agentDelivery.status, "pending"),
					),
				);
		}
	});
}

export async function getSessionOrFail(sessionId: number, userId: string, taskId: number) {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
	});
	if (!session || session.userId !== userId || session.taskId !== taskId) {
		return null;
	}
	return session;
}
