import { json } from "@sveltejs/kit";
import { LANGUAGE_CODES, type LanguageCode } from "$lib/constants";
import { getDueCards, getReviewStats } from "$lib/server/review-cards";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const language = (user.activeLanguage ?? "en") as LanguageCode;
	if (!(LANGUAGE_CODES as readonly string[]).includes(language)) {
		return json({ error: "Invalid language" }, { status: 400 });
	}

	try {
		const [cards, stats] = await Promise.all([getDueCards(user.id, language, 20), getReviewStats(user.id, language)]);

		return json({ cards, stats });
	} catch (error) {
		console.error("Failed to fetch due cards:", error);
		return json({ error: "Failed to fetch due cards" }, { status: 500 });
	}
};
