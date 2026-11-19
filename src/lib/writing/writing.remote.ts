import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { LEARNABLE } from "#lib/constants.ts";
import { db } from "#lib/server/db/index.ts";
import { piece } from "#lib/server/db/schema.ts";
import { learner } from "#lib/server/guard.ts";
import { credit } from "#lib/server/week/days.ts";
import { pieceOf, piecesPage, postedValue, shelvesOf } from "#lib/server/writing/pieces.ts";
import { takeUp } from "#lib/server/writing/take-up.ts";
import { week } from "#lib/week/week.remote.ts";
import { command, query } from "$app/server";
import type { PiecesPage, PieceView, Shelf } from "./types.ts";

/* The learner's pieces: the lists, one piece's page, and what they say about a piece afterwards. */

const pieceId = z.guid();

/** What every page shows of the learner's pieces, per language (types.ts `Shelf`; the root layout's load gives it). */
export const shelves = query(async (): Promise<Record<string, Shelf>> => shelvesOf(learner().id));

/** A page of My writing in a language, newest first (the first without `after`). */
export const piecesInPage = query(
	z.object({ lang: z.enum(LEARNABLE), after: pieceId.optional() }),
	async ({ lang, after }): Promise<PiecesPage> => piecesPage(learner().id, lang, after),
);

/** An abandoned piece taken up again (server/writing/take-up.ts): where the page goes now. */
export const takeUpPiece = command(pieceId, async (id) => {
	const r = await takeUp(learner(), id);
	await shelves().refresh();
	return r;
});

/** Any id a link may carry; one that is not a piece of theirs is simply none. */
export const pieceById = query(
	z.string(),
	async (id): Promise<PieceView | null> => (pieceId.safeParse(id).success ? pieceOf(learner().id, id) : null),
);

const mine = (userId: string, id: string) => and(eq(piece.id, id), eq(piece.userId, userId));

/** Whether they posted it (the follow-up and the piece's page ask). */
export const answerPosted = command(z.object({ id: pieceId, posted: z.enum(["yes", "not-yet", "no"]) }), async ({ id, posted }) => {
	const u = learner();
	await db
		.update(piece)
		.set({ posted: postedValue(posted), askedAt: new Date() })
		.where(and(mine(u.id, id), isNotNull(piece.finishedAt)));
});

/** The piece written again from memory, a few days on: learning something, so the day's half. */
export const writeAgain = command(z.object({ id: pieceId, text: z.string().trim().min(1).max(20_000) }), async ({ id, text }) => {
	const u = learner();
	const changed = await db.transaction(async (tx) => {
		const now = new Date();
		const [p] = await tx
			.update(piece)
			.set({ againText: text, againAt: now })
			.where(and(mine(u.id, id), isNotNull(piece.finishedAt)))
			.returning({ language: piece.language });
		return p ? credit(tx, u, "learned", p.language, now) : false;
	});
	if (changed) await week().refresh();
});
