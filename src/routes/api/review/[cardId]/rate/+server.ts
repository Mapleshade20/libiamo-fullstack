import { json } from "@sveltejs/kit";
import { reviewRatingSchema } from "$lib/schemas";
import { rateCard } from "$lib/server/review-cards";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const cardId = Number(event.params.cardId);
	if (Number.isNaN(cardId)) {
		return json({ error: "Invalid card ID" }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = reviewRatingSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: "Invalid rating data", details: parsed.error.issues }, { status: 400 });
	}

	try {
		const result = await rateCard(cardId, user.id, parsed.data.rating as 1 | 2 | 3 | 4, parsed.data.elapsedSeconds);
		return json(result);
	} catch (error) {
		if (error instanceof Error && error.message === "Card not found") {
			return json({ error: "Card not found" }, { status: 404 });
		}
		console.error("Failed to rate card:", error);
		return json({ error: "Failed to submit rating" }, { status: 500 });
	}
};
