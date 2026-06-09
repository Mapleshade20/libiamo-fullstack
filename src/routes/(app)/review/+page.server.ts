import { error } from "@sveltejs/kit";
import { eq, sql } from "drizzle-orm";
import { type CardType, LANGUAGE_CODES, type LanguageCode } from "$lib/constants";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { reviewCard } from "$lib/server/db/schema";
import { getDueCards } from "$lib/server/review-cards";
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

	try {
		cards = (await getDueCards(user.id, language, 20)).map((c) => ({
			id: c.id,
			front: c.front,
			back: c.back,
			cardType: c.cardType as CardType,
			previewIntervals: c.previewIntervals,
		}));
	} catch (err) {
		console.error("Failed to load review data:", err);
	}

	let cardCount = 0;

	try {
		const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(reviewCard).where(eq(reviewCard.userId, user.id));
		cardCount = result?.count ?? 0;
	} catch {
		// table may not exist yet
	}

	return { cards, cardCount };
};
