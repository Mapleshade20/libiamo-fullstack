import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { type CardType, LANGUAGE_CODES, type LanguageCode } from "$lib/constants";
import { requireUser } from "$lib/server/authz";
import { db } from "$lib/server/db";
import { reviewCard } from "$lib/server/db/schema";
import { getDueCards, getReviewStats } from "$lib/server/review-cards";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);

	const language = (user.activeLanguage ?? "en") as LanguageCode;
	if (!(LANGUAGE_CODES as readonly string[]).includes(language)) {
		throw error(400, "Invalid language");
	}

	let cards: Array<{
		id: number;
		front: string;
		back: string;
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
			cardType: c.cardType as CardType,
			previewIntervals: c.previewIntervals,
		}));
		stats = loadedStats;
	} catch (err) {
		console.error("Failed to load review data:", err);
	}

	let allCards: Array<{ id: number; front: string; back: string; cardType: CardType }> = [];

	try {
		allCards = (
			await db
				.select({ id: reviewCard.id, front: reviewCard.front, back: reviewCard.back, cardType: reviewCard.cardType })
				.from(reviewCard)
				.where(eq(reviewCard.userId, user.id))
		).map((c) => ({ ...c, cardType: c.cardType as CardType }));
	} catch {
		// table may not exist yet
	}

	return { cards, stats, language, allCards };
};
