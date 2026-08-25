import { json } from "@sveltejs/kit";
import { getUnreadInbox } from "$lib/server/unread";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const items = await getUnreadInbox(user.id);
	return json({ items, total: items.reduce((total, item) => total + item.unreadCount, 0) });
};
