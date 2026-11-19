import { and, count, desc, eq } from "drizzle-orm";
import type { SuggestionPlace } from "#lib/constants.ts";
import { live, type Version } from "#lib/scenario/versions.ts";
import { db } from "#lib/server/db/index.ts";
import { scenario, suggestion, user } from "#lib/server/db/schema.ts";

/*
 * Situations learners suggest for scenarios (the shelf's "+"). At most five wait for review at a time; one the admin has
 * made a draft of no longer counts, but the learner sees it waiting until that scenario is offered in its language. The
 * admin may also set one aside with a reason the learner reads on the same page.
 */
export const PENDING_LIMIT = 5;

export type MySuggestion = {
	id: string;
	place: SuggestionPlace;
	language: string;
	purpose: string;
	status: "pending" | "live" | "unused";
	reason: string | null;
	/** The scenario it became, once learners are offered it. */
	scenarioId: string | null;
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
			scenarioId: suggestion.scenarioId,
			scenarioStatus: scenario.status,
			versions: scenario.versions,
		})
		.from(suggestion)
		.leftJoin(scenario, eq(scenario.id, suggestion.scenarioId))
		.where(eq(suggestion.userId, userId))
		.orderBy(desc(suggestion.createdAt));
	return rows.map(({ scenarioStatus, versions, createdAt, ...r }) => {
		const offered = scenarioStatus === "published" && live((versions as Record<string, Version> | null)?.[r.language]);
		const status = r.status === "live" && !offered ? "pending" : (r.status as MySuggestion["status"]);
		return { ...r, place: r.place as SuggestionPlace, status, scenarioId: status === "live" ? r.scenarioId : null, at: createdAt.getTime() };
	});
}

/** Files a suggestion; false when five are already waiting. */
export async function suggest(
	userId: string,
	input: { place: SuggestionPlace; language: string; situation: string; who?: string; purpose: string; mine?: string },
): Promise<boolean> {
	return db.transaction(async (tx) => {
		// The learner's row is the lock: two suggestions sent at once cannot both slip under the limit.
		await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
		const [{ n }] = await tx
			.select({ n: count() })
			.from(suggestion)
			.where(and(eq(suggestion.userId, userId), eq(suggestion.status, "pending")));
		if (n >= PENDING_LIMIT) return false;
		await tx.insert(suggestion).values({ userId, ...input, who: input.who || null, mine: input.mine || null });
		return true;
	});
}
