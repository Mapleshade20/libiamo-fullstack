import { and, asc, desc, eq, inArray, isNull, lt, lte, ne, type SQL, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { exchange, exchangeMessage, piece } from "#lib/server/db/schema.ts";
import { ASK_AGAIN_MS, pickFollowUp, WRITE_AGAIN_MS } from "#lib/writing/follow-up.ts";
import type { Learned, Leftover, PieceItem, PiecesPage, PieceView, Posted, Shelf } from "#lib/writing/types.ts";

/* The learner's pieces as the pages read them: the lists, and one piece's page. */

const POSTED_IN: Record<string, Posted> = { yes: "yes", not_yet: "not-yet", no: "no" };
export const postedValue = (p: Posted) => (p === "not-yet" ? "not_yet" : p);
const ms = (d: Date | null) => d?.getTime();

/** What a list shows of a piece. */
const listed = {
	id: piece.id,
	title: piece.title,
	place: piece.place,
	language: piece.language,
	scenarioId: piece.scenarioId,
	state: piece.state,
	createdAt: piece.createdAt,
	finishedAt: piece.finishedAt,
	posted: piece.posted,
	askedAt: piece.askedAt,
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
		phase: r.state === "writing" || r.state === "revising" || r.state === "finished" || r.state === "abandoned" ? r.state : undefined,
		scenarioId: r.scenarioId ?? undefined,
		finishedAt: ms(r.finishedAt),
		posted,
		askedAt: ms(r.askedAt),
		again: r.againAt ? { at: r.againAt.getTime() } : undefined,
		state: posted === "yes" ? "posted" : finished ? "revised" : undefined,
	};
}

/** How many unfinished pieces the shelf shows at most (a learner has one or two). */
const OPEN_LIMIT = 50;
const RECENT = 6;

/**
 * The shelf of every language the learner has written in (types.ts `Shelf`): what every page shows, the same size
 * however much they have written. Each part is one query bounded by its limit; the follow-up's candidates are the newest
 * due piece of each kind per language (lib/writing/follow-up.ts).
 */
export async function shelvesOf(userId: string, now = new Date()): Promise<Record<string, Shelf>> {
	const mine = eq(piece.userId, userId);
	const finished = and(mine, eq(piece.state, "finished"));
	const ranked = db
		.select({ ...listed, n: sql<number>`row_number() over (partition by ${piece.language} order by ${piece.id} desc)`.as("n") })
		.from(piece)
		.where(and(mine, ne(piece.state, "abandoned")))
		.as("ranked");
	const newestDue = (where: SQL | undefined) =>
		db.selectDistinctOn([piece.language], listed).from(piece).where(where).orderBy(piece.language, desc(piece.id));
	const [open, recent, unasked, notYet, again, counts] = await Promise.all([
		db
			.select(listed)
			.from(piece)
			.where(and(mine, inArray(piece.state, ["writing", "revising"])))
			.orderBy(desc(piece.id))
			.limit(OPEN_LIMIT),
		db.select().from(ranked).where(lte(ranked.n, RECENT)).orderBy(desc(ranked.id)),
		newestDue(and(finished, isNull(piece.scenarioId), isNull(piece.posted))),
		newestDue(and(finished, isNull(piece.scenarioId), eq(piece.posted, "not_yet"), lte(piece.askedAt, new Date(now.getTime() - ASK_AGAIN_MS)))),
		newestDue(and(finished, isNull(piece.againAt), lte(piece.finishedAt, new Date(now.getTime() - WRITE_AGAIN_MS)))),
		db.select({ language: piece.language, n: sql<number>`count(*)::int` }).from(piece).where(finished).groupBy(piece.language),
	]);
	const shelves: Record<string, Shelf> = {};
	const of = (language: string) => {
		shelves[language] ??= { open: [], recent: [], finished: 0 };
		return shelves[language];
	};
	for (const r of open) of(r.language).open.push(itemOf(r));
	for (const { n: _, ...r } of recent) of(r.language).recent.push(itemOf(r));
	for (const c of counts) of(c.language).finished = c.n;
	const byLanguage = (rows: Listed[]) => new Map(rows.map((r) => [r.language, itemOf(r)]));
	const [u, y, a] = [byLanguage(unasked), byLanguage(notYet), byLanguage(again)];
	for (const language of Object.keys(shelves)) {
		const followUp = pickFollowUp({ unasked: u.get(language), notYet: y.get(language), again: a.get(language) });
		if (followUp) shelves[language].followUp = followUp;
	}
	return shelves;
}

/** How many pieces a page of My writing holds: more than most learners have. */
export const PIECES_PAGE = 100;

/** A page of the learner's pieces in a language, newest first (ids are uuidv7); `next` names where the next starts. */
export async function piecesPage(userId: string, language: string, after?: string): Promise<PiecesPage> {
	const rows = await db
		.select(listed)
		.from(piece)
		.where(and(eq(piece.userId, userId), eq(piece.language, language), after ? lt(piece.id, after) : undefined))
		.orderBy(desc(piece.id))
		.limit(PIECES_PAGE + 1);
	const items = rows.slice(0, PIECES_PAGE).map(itemOf);
	return { items, ...(rows.length > PIECES_PAGE ? { next: items[items.length - 1].id } : {}) };
}

/** One of the learner's pieces, with what its revision left once it is finished. */
export async function pieceOf(userId: string, id: string): Promise<PieceView | null> {
	const [r] = await db
		.select({
			...listed,
			learned: piece.learned,
			notesRequestedAt: piece.notesRequestedAt,
			againText: piece.againText,
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
	// The page shows what a list does not: what the notebook keeps from it, and what was written again.
	const item: PieceItem = {
		...itemOf(r),
		learned: (r.learned as Learned[] | null) ?? undefined,
		notesPending: ms(r.notesRequestedAt),
		again: r.againText && r.againAt ? { text: r.againText, at: r.againAt.getTime() } : undefined,
	};
	if (r.state === "abandoned") return { ...item, ...(r.text.trim() ? { draft: r.text } : {}) };
	if (r.state !== "finished" || !r.finishedAt) return item;
	const ending = r.scenarioId ? await endingOf(id) : [];
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
			...(ending.length ? { ending } : {}),
			finishedAt: r.finishedAt.getTime(),
		},
	};
}

/** How the others answered after the learner's last message in a scenario's place. */
async function endingOf(pieceId: string): Promise<{ author: string; text: string }[]> {
	const rows = await db
		.select({ role: exchangeMessage.role, content: exchangeMessage.content, meta: exchangeMessage.llmMetadata })
		.from(exchangeMessage)
		.innerJoin(exchange, eq(exchange.id, exchangeMessage.exchangeId))
		.where(eq(exchange.pieceId, pieceId))
		.orderBy(asc(exchangeMessage.createdAt), asc(exchangeMessage.id));
	const last = rows.findLastIndex((m) => m.role === "user");
	return rows
		.slice(last + 1)
		.map((m) => ({ author: String((m.meta as { assistantAuthorName?: string } | null)?.assistantAuthorName ?? ""), text: m.content }));
}
