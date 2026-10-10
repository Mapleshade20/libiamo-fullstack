import { and, eq, gt, inArray, type SQL, sql } from "drizzle-orm";
import type { UnreadInboxItem } from "$lib/practice/unread";
import { db } from "$lib/server/db";
import { agentResponseBatch, practiceSession, sessionMessage, task } from "$lib/server/db/schema";
import { scheduleWorldMoment } from "$lib/server/practice/agent-replies/worker";

/**
 * Join condition for a session's unread replies: assistant messages past its seen-watermark.
 * `session_message_unread_idx` (session, id) over assistant rows turns it into one index range per
 * session, so the cost follows the unread messages rather than the whole history.
 */
const unreadReply = and(
	eq(sessionMessage.sessionId, practiceSession.id),
	eq(sessionMessage.role, "assistant"),
	gt(sessionMessage.id, sql`coalesce(${practiceSession.lastSeenAssistantMessageId}, 0)`),
);

/** A correlated count of `practiceSession`'s unread replies, for selects over sessions. */
export const unreadReplyCount = sql<number>`(select count(*)::int from ${sessionMessage} where ${unreadReply})`;

/**
 * The earliest outstanding agent work in ONE statement, so both halves read the same snapshot:
 * with two separate reads, a generation committing in between can hide live work from both — its
 * batch leaves the composing statuses before its pacing deliveries are visible to a read that
 * already ran, and the poller would stop while work exists. Composing batches count by their own
 * due time; delivery-pending batches by their pending deliveries' due times, never their stale
 * own one. Null when nothing is outstanding.
 */
export async function earliestOutstandingDueAtInScope(scope: SQL): Promise<Date | null> {
	const rows = (await db.execute(sql`select least(
			(select min(b.due_at) from agent_response_batch b
				inner join practice_session s on s.id = b.session_id
				where ${scope} and b.status in ('pending', 'processing', 'stale')),
			(select min(d.due_at) from agent_delivery d
				inner join agent_response_batch b on b.id = d.batch_id
				inner join practice_session s on s.id = b.session_id
				where ${scope} and b.status = 'delivery_pending' and d.status = 'pending')
		) as "dueAt"`)) as unknown as Array<{ dueAt: Date | string | null }>;
	const dueAt = rows[0]?.dueAt;
	if (dueAt === null || dueAt === undefined) return null;
	// The database renders timestamps as naive UTC strings; the column's own parser reads them as
	// UTC, never by the server's local timezone (eight hours early would mean endless polling).
	return agentResponseBatch.dueAt.mapFromDriverValue(dueAt) as Date;
}

/**
 * Advances a session's seen-watermark to an assistant message the reader was shown, in one
 * statement that also proves the session is theirs and the message is an assistant reply in it.
 * The watermark only ever moves forward: two acknowledgements can overlap, and letting the older
 * snapshot's (smaller) id win would resurface already-read replies as unread. Reports a message
 * outside the reader's sessions as not acknowledged.
 *
 * Reading the thread also resumes ambient life: an async group scene whose learner is silent
 * with no outstanding reply work gets one world moment on the idle cadence, within the budget;
 * `worldScheduled` tells the caller to refresh the session's polling plan.
 */
export async function acknowledgeAssistantMessage(
	sessionId: number,
	userId: string,
	messageId: number,
): Promise<{ acknowledged: boolean; worldScheduled: boolean }> {
	return db.transaction(async (tx) => {
		// Lock order session -> batch -> delivery, matching submitMessage and the worker, so the
		// watermark write and the world resume serialize against concurrent submissions.
		const [locked] = await tx
			.select({ id: practiceSession.id })
			.from(practiceSession)
			.where(and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, userId)))
			.for("update");
		if (!locked) return { acknowledged: false, worldScheduled: false };
		const rows = await tx
			.update(practiceSession)
			.set({ lastSeenAssistantMessageId: sql`greatest(coalesce(${practiceSession.lastSeenAssistantMessageId}, 0), ${messageId})` })
			.where(
				and(
					eq(practiceSession.id, sessionId),
					eq(practiceSession.userId, userId),
					sql`exists (select 1 from ${sessionMessage} where ${sessionMessage.id} = ${messageId} and ${sessionMessage.sessionId} = ${sessionId} and ${sessionMessage.role} = 'assistant')`,
				),
			)
			.returning({ id: practiceSession.id });
		if (rows.length === 0) return { acknowledged: false, worldScheduled: false };
		const outstandingReply = await tx.query.agentResponseBatch.findFirst({
			where: and(
				eq(agentResponseBatch.sessionId, sessionId),
				eq(agentResponseBatch.kind, "reply"),
				inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
			),
			columns: { id: true },
		});
		const worldScheduled = !outstandingReply && (await scheduleWorldMoment(tx, { sessionId, now: new Date() }));
		return { acknowledged: true, worldScheduled };
	});
}

/**
 * Lists the user's tasks with assistant messages delivered after the session's
 * seen-watermark, newest unread arrival first. Ages come from the database
 * clock so the naive timestamp convention never leaks into the client.
 */
export async function getUnreadInbox(userId: string): Promise<UnreadInboxItem[]> {
	return db
		.select({
			sessionId: practiceSession.id,
			taskId: task.id,
			lineupId: practiceSession.lineupId,
			title: task.title,
			ui: task.ui,
			sessionStatus: practiceSession.status,
			unreadCount: sql<number>`count(*)::int`,
			latestAgeSeconds: sql<number | null>`extract(epoch from (now() - max(${sessionMessage.createdAt})))::int`,
		})
		.from(practiceSession)
		.innerJoin(sessionMessage, unreadReply)
		.innerJoin(task, eq(task.id, practiceSession.taskId))
		.where(and(eq(practiceSession.userId, userId), inArray(practiceSession.status, ["in_progress", "completed", "evaluated", "abandoned"])))
		.groupBy(practiceSession.id, task.id, task.title, task.ui)
		.orderBy(sql`max(${sessionMessage.createdAt}) desc`);
}

/**
 * When the next agent reply work for any of the user's sessions falls due: the only way an unread
 * reply can appear without the reader acting. Null when nothing is outstanding, so the Hall can
 * stop polling altogether. One statement, so a generation committing mid-poll cannot hide live
 * work from both halves.
 */
export async function getNextAgentWorkDueAt(userId: string): Promise<Date | null> {
	return earliestOutstandingDueAtInScope(sql`s.user_id = ${userId}`);
}
