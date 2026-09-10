import { json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "$lib/server/db";
import { practiceSession, sessionMessage } from "$lib/server/db/schema";
import { getUnreadInbox, markAssistantMessagesSeen } from "$lib/server/unread";
import type { RequestHandler } from "./$types";

const receiptSchema = z.object({ sessionId: z.number().int().positive().safe(), messageId: z.number().int().positive().safe() });

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });
	const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: "Invalid read receipt" }, { status: 400 });
	const { sessionId, messageId } = parsed.data;
	const [message] = await db
		.select({ id: sessionMessage.id })
		.from(sessionMessage)
		.innerJoin(practiceSession, eq(practiceSession.id, sessionMessage.sessionId))
		.where(
			and(
				eq(practiceSession.userId, locals.user.id),
				eq(practiceSession.id, sessionId),
				eq(sessionMessage.id, messageId),
				eq(sessionMessage.role, "assistant"),
			),
		)
		.limit(1);
	if (!message) return json({ error: "Message not found" }, { status: 404 });
	await markAssistantMessagesSeen(sessionId, locals.user.id, messageId);
	return new Response(null, { status: 204 });
};

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const items = await getUnreadInbox(user.id);
	return json({ items, total: items.reduce((total, item) => total + item.unreadCount, 0) });
};
