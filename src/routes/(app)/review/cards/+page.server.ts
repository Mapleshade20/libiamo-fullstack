import { eq } from "drizzle-orm";
import type { CardType } from "$lib/constants";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { reviewCard } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);

	const cards = await db
		.select({
			id: reviewCard.id,
			front: reviewCard.front,
			back: reviewCard.back,
			cardType: reviewCard.cardType,
		})
		.from(reviewCard)
		.where(eq(reviewCard.userId, user.id));

	return { cards: cards.map((c) => ({ ...c, cardType: c.cardType as CardType })) };
};
