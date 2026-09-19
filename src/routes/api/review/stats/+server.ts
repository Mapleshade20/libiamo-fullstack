import { json } from "@sveltejs/kit";
import { LANGUAGE_CODES, type LanguageCode } from "$lib/constants";
import { getAvailableCardsByLanguage, getReviewStats } from "$lib/server/review";
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
		// The account-wide breakdown is an extra aggregate, so it is opt-in: the streak popover asks
		// for it when it first opens, and ordinary navigation never pays for it.
		if (event.url.searchParams.get("byLanguage") !== "1") return json(stats);
		return json({ ...stats, byLanguage: await getAvailableCardsByLanguage(user.id) });
	} catch (error) {
		console.error("Failed to fetch review stats:", error);
		return json({ error: "Failed to fetch review stats" }, { status: 500 });
	}
};
