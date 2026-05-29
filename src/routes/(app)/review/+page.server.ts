import { error } from "@sveltejs/kit";
import { type CardType, LANGUAGE_CODES, type LanguageCode } from "$lib/constants";
import { getDueCards, getReviewStats } from "$lib/server/review-cards";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) throw error(401, "Unauthorized");

	const language = (user.activeLanguage ?? "en") as LanguageCode;
	if (!(LANGUAGE_CODES as readonly string[]).includes(language)) {
		throw error(400, "Invalid language");
	}

	let cards: Array<{
		id: number;
		front: string;
		back: string;
		context: string | null;
		cardType: CardType;
		previewIntervals: Record<string, string>;
	}> = [];
	let stats: Record<string, number> = {};

	try {
		const [loadedCards, loadedStats] = await Promise.all([getDueCards(user.id, language, 20), getReviewStats(user.id, language)]);
		cards = loadedCards.map((c) => ({
			id: c.id,
			front: c.front,
			back: c.back,
			context: c.context,
			cardType: c.cardType as CardType,
			previewIntervals: c.previewIntervals,
		}));
		stats = loadedStats;
	} catch (err) {
		console.error("Failed to load review data:", err);
	}

	return { cards, stats, language };
};
