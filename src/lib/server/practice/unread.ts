import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { UnreadInboxItem } from "$lib/practice/unread";
import { db } from "$lib/server/db";
import { agentResponseBatch, practiceSession, sessionMessage, task } from "$lib/server/db/schema";

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
 * Advances a session's seen-watermark to an assistant message the reader was shown, in one
 * statement that also proves the session is theirs and the message is an assistant reply in it.
 * The watermark only ever moves forward: two acknowledgements can overlap, and letting the older
 * snapshot's (smaller) id win would resurface already-read replies as unread. Returns false when
 * no such message exists.
 */
export async function acknowledgeAssistantMessage(sessionId: number, userId: string, messageId: number): Promise<boolean> {
	const rows = await db
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
	return rows.length > 0;
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
 * stop polling altogether.
 */
export async function getNextAgentWorkDueAt(userId: string): Promise<Date | null> {
	const [row] = await db
		.select({ dueAt: sql<Date | null>`min(${agentResponseBatch.dueAt})`.mapWith(agentResponseBatch.dueAt) })
		.from(agentResponseBatch)
		.innerJoin(practiceSession, eq(practiceSession.id, agentResponseBatch.sessionId))
		.where(and(eq(practiceSession.userId, userId), inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"])));
	return row?.dueAt ?? null;
}
