import { json } from "@sveltejs/kit";
import { LANGUAGE_CODES, type LanguageCode } from "$lib/constants";
import { getReviewStats } from "$lib/server/review";
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
		const stats = await getReviewStats(user.id, language);
		return json(stats);
	} catch (error) {
		console.error("Failed to fetch review stats:", error);
		return json({ error: "Failed to fetch review stats" }, { status: 500 });
	}
};
