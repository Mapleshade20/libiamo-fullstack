import { json } from "@sveltejs/kit";
import { reviewRatingSchema } from "$lib/schemas";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { ReviewCardNotDueError, rateNote } from "$lib/server/review";
import { observeReviewQueue } from "$lib/server/streak";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) return json({ error: "Unauthorized" }, { status: 401 });
	const noteId = Number(event.params.noteId);
	if (!Number.isInteger(noteId) || noteId < 1) return json({ error: "Invalid note ID" }, { status: 400 });

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const parsed = reviewRatingSchema.safeParse(body);
	if (!parsed.success) return json({ error: "Invalid rating data", details: parsed.error.issues }, { status: 400 });
	try {
		const result = await rateNote(noteId, user.id, parsed.data.rating as 1 | 2 | 3 | 4, parsed.data.elapsedSeconds);
		// After the rating, so the queue check sees the card's new due date. The streak is non-null
		// only when something changed, which is what tells the study UI to invalidate.
		const streak = await observeReviewQueue(user.id, new Date(), getBrowserTimezone(event.cookies));
		return json({ ...result, streak });
	} catch (error) {
		if (error instanceof Error && error.message === "Note not found") return json({ error: "Note not found" }, { status: 404 });
		if (error instanceof ReviewCardNotDueError) return json({ error: error.message }, { status: 409 });
		console.error("Failed to rate note:", error);
		return json({ error: "Failed to submit rating" }, { status: 500 });
	}
};
