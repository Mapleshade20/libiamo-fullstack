import { and, count, desc, eq } from "drizzle-orm";
import type { SuggestionPlace } from "#lib/constants.ts";
import { db } from "#lib/server/db/index.ts";
import { suggestion, user } from "#lib/server/db/schema.ts";

/*
 * Situations learners suggest for scenarios (the shelf's "+"). At most five wait for review at a time. The admin makes a
 * draft scenario of one, or sets it aside with a reason the learner reads on the same page.
 */
export const PENDING_LIMIT = 5;

export type MySuggestion = {
	id: string;
	place: SuggestionPlace;
	language: string;
	purpose: string;
	status: "pending" | "live" | "unused";
	reason: string | null;
	at: number;
};

export async function suggestionsOf(userId: string): Promise<MySuggestion[]> {
	const rows = await db
		.select({
			id: suggestion.id,
			place: suggestion.place,
			language: suggestion.language,
			purpose: suggestion.purpose,
			status: suggestion.status,
			reason: suggestion.reason,
			createdAt: suggestion.createdAt,
		})
		.from(suggestion)
		.where(eq(suggestion.userId, userId))
		.orderBy(desc(suggestion.createdAt));
	return rows.map((r) => ({
		...r,
		place: r.place as SuggestionPlace,
		status: r.status as MySuggestion["status"],
		at: r.createdAt.getTime(),
	}));
}

/** Files a suggestion; false when five are already waiting. */
export async function suggest(
	userId: string,
	input: { place: SuggestionPlace; language: string; situation: string; purpose: string; mine?: string },
): Promise<boolean> {
	return db.transaction(async (tx) => {
		// The learner's row is the lock: two suggestions sent at once cannot both slip under the limit.
		await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
		const [{ n }] = await tx
			.select({ n: count() })
			.from(suggestion)
			.where(and(eq(suggestion.userId, userId), eq(suggestion.status, "pending")));
		if (n >= PENDING_LIMIT) return false;
		await tx.insert(suggestion).values({ userId, ...input, mine: input.mine || null });
		return true;
	});
}
