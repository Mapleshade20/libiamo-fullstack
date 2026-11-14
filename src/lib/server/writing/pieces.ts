import { and, desc, eq } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { piece } from "#lib/server/db/schema.ts";
import type { Learned, Leftover, PieceItem, PieceView, Posted } from "#lib/writing/types.ts";

/* The learner's pieces as the pages read them: the lists, and one piece's page. */

const POSTED_IN: Record<string, Posted> = { yes: "yes", not_yet: "not-yet", no: "no" };
export const postedValue = (p: Posted) => (p === "not-yet" ? "not_yet" : p);
const ms = (d: Date | null) => d?.getTime();

const listed = {
	id: piece.id,
	title: piece.title,
	place: piece.place,
	language: piece.language,
	scenarioId: piece.scenarioId,
	state: piece.state,
	createdAt: piece.createdAt,
	finishedAt: piece.finishedAt,
	learned: piece.learned,
	notesRequestedAt: piece.notesRequestedAt,
	posted: piece.posted,
	askedAt: piece.askedAt,
	againText: piece.againText,
	againAt: piece.againAt,
};
type Listed = { [K in keyof typeof listed]: (typeof piece.$inferSelect)[K] };

function itemOf(r: Listed): PieceItem {
	const posted = r.posted ? POSTED_IN[r.posted] : undefined;
	const finished = r.state === "finished";
	return {
		id: r.id,
		title: r.title,
		site: r.place,
		lang: r.language,
		at: r.createdAt.getTime(),
		open: r.state === "writing" || r.state === "revising",
		scenarioId: r.scenarioId ?? undefined,
		finishedAt: ms(r.finishedAt),
		learned: (r.learned as Learned[] | null) ?? undefined,
		notesPending: ms(r.notesRequestedAt),
		posted,
		askedAt: ms(r.askedAt),
		again: r.againText && r.againAt ? { text: r.againText, at: r.againAt.getTime() } : undefined,
		state: posted === "yes" ? "posted" : finished ? "revised" : undefined,
	};
}

/** Every piece of the learner's, the newest first (set aside ones are not listed). */
export async function piecesOf(userId: string): Promise<PieceItem[]> {
	const rows = await db.select(listed).from(piece).where(eq(piece.userId, userId)).orderBy(desc(piece.createdAt));
	return rows.filter((r) => r.state !== "set_aside").map(itemOf);
}

/** One of the learner's pieces, with what its revision left once it is finished. */
export async function pieceOf(userId: string, id: string): Promise<PieceView | null> {
	const [r] = await db
		.select({
			...listed,
			text: piece.text,
			final: piece.final,
			closing: piece.closing,
			reader: piece.reader,
			leftovers: piece.leftovers,
			authentic: piece.authentic,
		})
		.from(piece)
		.where(and(eq(piece.id, id), eq(piece.userId, userId)));
	if (!r) return null;
	const item = itemOf(r);
	if (r.state !== "finished" || !r.finishedAt) return item;
	return {
		...item,
		result: {
			original: r.text,
			final: r.final ?? r.text,
			closing: r.closing ?? "",
			reader: r.reader ?? "",
			learned: item.learned ?? [],
			notesPending: item.notesPending,
			leftovers: (r.leftovers as Leftover[] | null) ?? [],
			authentic: r.authentic ?? undefined,
			finishedAt: r.finishedAt.getTime(),
		},
	};
}
