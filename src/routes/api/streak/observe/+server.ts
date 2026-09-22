import { json } from "@sveltejs/kit";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { getStreakRecord, recordReviewObservation } from "$lib/server/streak";
import type { RequestHandler } from "./$types";

/** A visible app confirms an empty loader snapshot; prefetching must never grant credit. */
export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });
	try {
		const streak =
			(await recordReviewObservation(locals.user.id, new Date(), getBrowserTimezone(cookies))) ?? (await getStreakRecord(locals.user.id));
		return json({ streak });
	} catch (cause) {
		console.error("Failed to observe the review queue:", cause);
		return json({ error: "Review observation unavailable" }, { status: 503 });
	}
};
