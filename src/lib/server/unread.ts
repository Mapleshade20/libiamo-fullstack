import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { practiceSession, sessionMessage, task, template } from "$lib/server/db/schema";
import type { UnreadInboxItem } from "$lib/unread";

const UNREAD_CONDITION = sql`(${sessionMessage.role} = 'assistant' and ${sessionMessage.id} > coalesce(${practiceSession.lastSeenAssistantMessageId}, 0))`;

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

	return rows
		.filter((row) => row.unreadCount > 0)
		.sort((a, b) => (b.latestAgeSeconds ?? 0) - (a.latestAgeSeconds ?? 0))
		.map(({ taskId, title, ui, sessionStatus, unreadCount, latestAgeSeconds }) => ({
			taskId,
			title,
			ui,
			sessionStatus,
			unreadCount,
			latestAgeSeconds,
		}));
}
