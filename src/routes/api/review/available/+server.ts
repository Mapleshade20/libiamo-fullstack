import { json } from "@sveltejs/kit";
import { countAvailableNotesByLanguage } from "$lib/server/streak";
import type { RequestHandler } from "./$types";

/** Which languages still owe reviews. The streak sheet asks when it opens; navigation never pays for it. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });
	try {
		return json({ byLanguage: await countAvailableNotesByLanguage(locals.user.id, new Date()) });
	} catch (cause) {
		console.error("Failed to count available review cards:", cause);
		return json({ error: "Failed to count available review cards" }, { status: 500 });
	}
};
