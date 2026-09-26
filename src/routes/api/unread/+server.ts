import { json } from "@sveltejs/kit";
import { z } from "zod";
import { acknowledgeAssistantMessage, getNextAgentWorkDueAt, getUnreadInbox } from "$lib/server/practice/unread";
import type { RequestHandler } from "./$types";

const receiptSchema = z.object({ sessionId: z.number().int().positive().safe(), messageId: z.number().int().positive().safe() });

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });
	const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: "Invalid read receipt" }, { status: 400 });
	const { sessionId, messageId } = parsed.data;
	if (!(await acknowledgeAssistantMessage(sessionId, locals.user.id, messageId))) return json({ error: "Message not found" }, { status: 404 });
	return new Response(null, { status: 204 });
};

/** The inbox, plus when the next reply can arrive so the Hall knows whether to poll at all. */
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) return json({ error: "Unauthorized" }, { status: 401 });

	const [items, nextAgentWorkDueAt] = await Promise.all([getUnreadInbox(user.id), getNextAgentWorkDueAt(user.id)]);
	return json({ items, total: items.reduce((total, item) => total + item.unreadCount, 0), nextAgentWorkDueAt });
};
