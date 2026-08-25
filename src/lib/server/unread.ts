import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { practiceSession, sessionMessage, task, template } from "$lib/server/db/schema";
import type { UnreadInboxItem } from "$lib/unread";

const UNREAD_CONDITION = sql`(${sessionMessage.role} = 'assistant' and ${sessionMessage.id} > coalesce(${practiceSession.lastSeenAssistantMessageId}, 0))`;

/**
 * Advances a session's seen-watermark to the newest assistant message the reader
 * was shown. The watermark only ever moves forward: the session page polls while
 * replies land, so two loads can overlap, and letting the older snapshot's
 * (smaller) id win would drag the watermark back and resurface already-read
 * replies as unread. Computing the maximum in the database keeps that decision
 * atomic instead of resolving it from a stale read.
 */
export async function markAssistantMessagesSeen(sessionId: number, userId: string, latestAssistantMessageId: number): Promise<void> {
	if (!latestAssistantMessageId) return;
	await db
		.update(practiceSession)
		.set({
			lastSeenAssistantMessageId: sql`greatest(coalesce(${practiceSession.lastSeenAssistantMessageId}, 0), ${latestAssistantMessageId})`,
		})
		.where(and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, userId)));
}

/**
 * Lists the user's tasks with assistant messages delivered after the session's
 * seen-watermark, newest unread arrival first. Ages come from the database
 * clock so the naive timestamp convention never leaks into the client.
 */
export async function getUnreadInbox(userId: string): Promise<UnreadInboxItem[]> {
	const rows = await db
		.select({
			taskId: task.id,
			title: task.title,
			ui: template.ui,
			sessionStatus: practiceSession.status,
			unreadCount: sql<number>`count(*) filter (where ${UNREAD_CONDITION})::int`,
			latestAgeSeconds: sql<number | null>`extract(epoch from (now() - max(${sessionMessage.createdAt}) filter (where ${UNREAD_CONDITION})))::int`,
		})
		.from(practiceSession)
		.innerJoin(task, eq(task.id, practiceSession.taskId))
		.innerJoin(template, eq(template.id, task.templateId))
		.leftJoin(sessionMessage, eq(sessionMessage.sessionId, practiceSession.id))
		.where(and(eq(practiceSession.userId, userId), inArray(practiceSession.status, ["in_progress", "completed", "evaluated"])))
		.groupBy(task.id, task.title, template.ui, practiceSession.status, practiceSession.lastSeenAssistantMessageId);

	return (
		rows
			.filter((row) => row.unreadCount > 0)
			// Smaller ages are newer replies, so newest unread conversations come first.
			.sort((a, b) => (a.latestAgeSeconds ?? 0) - (b.latestAgeSeconds ?? 0))
			.map(({ taskId, title, ui, sessionStatus, unreadCount, latestAgeSeconds }) => ({
				taskId,
				title,
				ui,
				sessionStatus,
				unreadCount,
				latestAgeSeconds,
			}))
	);
}
