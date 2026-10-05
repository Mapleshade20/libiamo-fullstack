import { json } from "@sveltejs/kit";
import { markAnnouncementRead } from "$lib/server/announcement";
import type { RequestHandler } from "./$types";

/** A learner acknowledged an announcement in the Hall inbox. */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id < 1) return json({ error: "Invalid announcement ID" }, { status: 400 });
	if (!(await markAnnouncementRead(locals.user.id, id))) return json({ error: "Announcement not found" }, { status: 404 });
	return new Response(null, { status: 204 });
};
