import { and, asc, desc, eq, inArray, isNull, lt, lte, ne, type SQL, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { db } from "#lib/server/db/index.ts";
import { exchange, exchangeMessage, piece } from "#lib/server/db/schema.ts";
import { ASK_AGAIN_MS, type Due, pickFollowUp, WRITE_AGAIN_MS } from "#lib/writing/follow-up.ts";
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
 * however much they have written. One query, each part bounded by its limit and tagged with its name: the unfinished,
 * the most recent per language (each carrying its language's count of finished pieces), and the follow-up's candidates,
 * the newest due piece of each kind per language (lib/writing/follow-up.ts).
 */
export async function shelvesOf(userId: string, now = new Date()): Promise<Record<string, Shelf>> {
	const mine = eq(piece.userId, userId);
	const finished = and(mine, eq(piece.state, "finished"));
	const part = (name: string) => sql<string>`${name}::text`.as("part");
	const none = sql<number | null>`null::int`.as("finished");
	const ranked = db
		.select({
			...listed,
			n: sql<number>`row_number() over (partition by ${piece.language} order by ${piece.id} desc)`.as("n"),
			finished: sql<number>`(count(*) filter (where ${piece.state} = 'finished') over (partition by ${piece.language}))::int`.as("finished"),
		})
		.from(piece)
		.where(and(mine, ne(piece.state, "abandoned")))
		.as("ranked");
	const recent = Object.fromEntries(Object.keys(listed).map((k) => [k, ranked[k as keyof typeof listed]])) as {
		[K in keyof typeof listed]: (typeof ranked)[K];
	};
	const newestDue = (name: keyof Due, where: SQL | undefined) =>
		db
			.selectDistinctOn([piece.language], { part: part(name), ...listed, finished: none })
			.from(piece)
			.where(where)
			.orderBy(piece.language, desc(piece.id));
	const rows = await unionAll(
		db
			.select({ part: part("open"), ...listed, finished: none })
			.from(piece)
			.where(and(mine, inArray(piece.state, ["writing", "revising"])))
			.orderBy(desc(piece.id))
			.limit(OPEN_LIMIT),
		db
			.select({ part: part("recent"), ...recent, finished: ranked.finished })
			.from(ranked)
			.where(lte(ranked.n, RECENT)),
		newestDue("unasked", and(finished, isNull(piece.scenarioId), isNull(piece.posted))),
		newestDue(
			"notYet",
			and(finished, isNull(piece.scenarioId), eq(piece.posted, "not_yet"), lte(piece.askedAt, new Date(now.getTime() - ASK_AGAIN_MS))),
		),
		newestDue("again", and(finished, isNull(piece.againAt), lte(piece.finishedAt, new Date(now.getTime() - WRITE_AGAIN_MS)))),
	);
	const shelves: Record<string, Shelf> = {};
	const of = (language: string) => {
		shelves[language] ??= { open: [], recent: [], finished: 0 };
		return shelves[language];
	};
	const due: Record<string, Due> = {};
	// Newest first within each part, as the shelf shows them.
	for (const { part: p, finished: count, ...r } of rows.sort((a, b) => (a.id < b.id ? 1 : -1))) {
		if (p === "open") of(r.language).open.push(itemOf(r));
		else if (p === "recent") {
			of(r.language).recent.push(itemOf(r));
			of(r.language).finished = count ?? 0;
		} else {
			due[r.language] ??= {};
			due[r.language][p as keyof Due] = itemOf(r);
		}
	}
	for (const language of Object.keys(shelves)) {
		const followUp = pickFollowUp(due[language] ?? {});
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
