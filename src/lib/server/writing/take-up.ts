import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { scenarioHref } from "#lib/scenario/href.ts";
import { db } from "#lib/server/db/index.ts";
import { exchange, exchangeMessage, piece } from "#lib/server/db/schema.ts";
import { LANGS, type Lang, normLang } from "#lib/server/revision/draft.ts";
import { startRevision } from "#lib/server/revision/store.ts";

/*
 * An abandoned piece taken up again, from what was written (server/revision/store.ts `abandon` kept it), back where it
 * was before its revision:
 * - the learner's own text: a fresh revision of the same draft;
 * - a translation: its sheet again, with the translation as it was sent (and its assignment);
 * - a scenario's conversation: the after page again, where going over it starts a fresh revision of what they wrote.
 * A scenario that already has another unfinished piece (at most one each), or a conversation with nothing of the
 * learner's in it, starts again from the scenario's page instead. Answers where the page goes, or null when the piece is
 * not theirs or not abandoned.
 */
type Learner = {
	id: string;
	helpImprove: boolean;
	timeZone?: string | null;
	nativeLanguage?: string | null;
	tutorLanguage: string;
	activeLanguage?: string | null;
};

export async function takeUp(u: Learner, pieceId: string): Promise<{ to: string } | null> {
	const [p] = await db
		.select()
		.from(piece)
		.where(and(eq(piece.id, pieceId), eq(piece.userId, u.id), eq(piece.state, "abandoned")));
	if (!p) return null;
	if (p.kind === "own" || !p.scenarioId) {
		await startRevision(
			u,
			{
				text: p.text,
				background: p.background ?? undefined,
				source: p.context ?? undefined,
				detail: p.detail === "more" ? "more" : "needed",
				learner: (LANGS as readonly string[]).includes(normLang(u.nativeLanguage ?? "")) ? (normLang(u.nativeLanguage ?? "") as Lang) : "en",
				feedback: u.tutorLanguage === "target" ? "target" : "native",
			},
			{ language: p.language, kind: "own", pieceId: p.id },
		);
		return { to: `/live/${p.id}` };
	}
	const fresh = { to: `/scenario/${p.scenarioId}` };
	if (p.kind === "scenario") {
		const [said] = await db
			.select({ id: exchangeMessage.id })
			.from(exchangeMessage)
			.innerJoin(exchange, eq(exchange.id, exchangeMessage.exchangeId))
			.where(and(eq(exchange.pieceId, p.id), eq(exchangeMessage.role, "user")))
			.limit(1);
		if (!said) return fresh;
	}
	const back = await db
		.transaction(async (tx) => {
			const [other] = await tx
				.select({ id: piece.id })
				.from(piece)
				.where(
					and(
						eq(piece.userId, u.id),
						eq(piece.scenarioId, p.scenarioId as string),
						eq(piece.language, p.language),
						inArray(piece.state, ["writing", "revising"]),
						ne(piece.id, p.id),
					),
				)
				.limit(1);
			if (other) return false;
			const [row] = await tx
				.update(piece)
				// Its thirty days start again from now.
				.set({ state: "writing", updatedAt: sql`now()` })
				.where(and(eq(piece.id, p.id), eq(piece.state, "abandoned")))
				.returning({ id: piece.id });
			return !!row;
		})
		// Another unfinished piece of the scenario made meanwhile (the partial unique index): that one goes on.
		.catch((e) => {
			if ((e as { cause?: { code?: string }; code?: string }).cause?.code === "23505" || (e as { code?: string }).code === "23505") return false;
			throw e;
		});
	if (!back) return fresh;
	return { to: scenarioHref(p.scenarioId as string, p.kind === "translation" ? "translate" : "after", p.language) };
}
