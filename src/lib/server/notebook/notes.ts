import { error } from "@sveltejs/kit";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Register, Verdict } from "#lib/constants.ts";
import type { DueSummary, Example, Note, ReviewCard } from "#lib/notebook/types.ts";
import { noteFaces } from "#lib/review/faces.ts";
import type { RatingName } from "#lib/review/types.ts";
import { db } from "#lib/server/db/index.ts";
import { note, piece, reading, reviewLog } from "#lib/server/db/schema.ts";
import { availableAt, LEARN_AHEAD_MS, newCard, preview, queueKind, rate, type StoredCard } from "#lib/server/review/scheduler.ts";
import { credit, queueEmpty, type WeekLearner, zoneOf } from "#lib/server/week/days.ts";
import { dayDelta, localDay } from "#lib/time/local-day.ts";
import type { Learned } from "#lib/writing/types.ts";

/*
 * The notebook (design §5.6): entries from the learner's own writing, filed when a piece's notes are written, and
 * entries collected from what they read, filed as each highlight is filled in. Every entry is a review card; which of
 * its faces review asks follows from how often it has been reviewed. A new entry is due from the learner's next day.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Learner = WeekLearner & { activeLanguage?: string | null };

const Examples = z
	.array(z.object({ t: z.string().max(1000), n: z.string().max(1000).optional(), span: z.string().max(400).optional() }))
	.max(8)
	.catch([]);

/** A finished piece's entries: those of its learned parts the notes call wrote a note for. Filed once. */
export async function fileOwn(
	tx: Tx,
	u: WeekLearner,
	p: { id: string; language: string; tutorLanguage: string },
	learned: Learned[],
	now = new Date(),
) {
	const [had] = await tx.select({ id: note.id }).from(note).where(eq(note.pieceId, p.id)).limit(1);
	if (had) return;
	const rows = learned.flatMap((l) => {
		if (!l.note) return [];
		const card = newCard(now, zoneOf(u));
		return [
			{
				userId: u.id,
				language: p.language,
				kind: "own" as const,
				pieceId: p.id,
				phrase: l.note.phrase,
				meaning: l.note.meaning,
				meaningLanguage: p.tutorLanguage,
				usage: l.note.usage || null,
				examples: Examples.parse(l.note.examples),
				sentence: l.final ?? null,
				was: l.before ?? null,
				fsrs: card,
				due: new Date(card.dueAt),
			},
		];
	});
	if (rows.length) await tx.insert(note).values(rows);
}

export type Collected = {
	phrase: string;
	meaning: string;
	register: Register;
	why: string;
	example: string;
	span?: string;
	marked: string;
	sentence: string;
};
/**
 * Phrases filled in from something the learner read, each kept the moment it is: the reading first (once), then an entry
 * for each. Returns the reading and the entries' ids, in order.
 */
export async function fileCollected(
	u: WeekLearner,
	r: { id?: string; text: string; language: string; place?: string; tutorLanguage: string },
	items: Collected[],
	now = new Date(),
): Promise<{ readingId: string; ids: string[] }> {
	return db.transaction(async (tx) => {
		let readingId = r.id;
		if (readingId) {
			const [mine] = await tx
				.select({ id: reading.id })
				.from(reading)
				.where(and(eq(reading.id, readingId), eq(reading.userId, u.id)));
			if (!mine) readingId = undefined;
		}
		if (!readingId)
			[{ id: readingId }] = await tx
				.insert(reading)
				.values({ userId: u.id, language: r.language, text: r.text, place: r.place || null })
				.returning({ id: reading.id });
		if (!items.length) return { readingId, ids: [] };
		const rows = await tx
			.insert(note)
			.values(
				items.map((it) => {
					const card = newCard(now, zoneOf(u));
					return {
						userId: u.id,
						language: r.language,
						kind: "collected" as const,
						readingId,
						phrase: it.phrase,
						meaning: it.meaning,
						meaningLanguage: r.tutorLanguage,
						register: it.register,
						why: it.why || null,
						examples: it.example ? [{ t: it.example, ...(it.span ? { span: it.span } : {}) }] : [],
						sentence: it.sentence || null,
						marked: it.marked,
						fsrs: card,
						due: new Date(card.dueAt),
					};
				}),
			)
			.returning({ id: note.id });
		return { readingId, ids: rows.map((x) => x.id) };
	});
}

const mine = (userId: string, id: string) => and(eq(note.id, id), eq(note.userId, userId), isNull(note.deletedAt));

type Row = typeof note.$inferSelect & { title: string | null };
const columns = { n: note, title: piece.title };

function faces(r: Row) {
	return noteFaces({
		kind: r.kind as Note["from"],
		phrase: r.phrase,
		gloss: r.meaning,
		before: r.was ?? undefined,
		final: r.sentence ?? undefined,
		sentence: r.sentence ?? undefined,
		marked: r.marked ?? undefined,
		examples: Examples.parse(r.examples),
	});
}
/** The face a card shows now: one per review, in turn. */
const faceOf = (r: Row) => {
	const all = faces(r);
	return all[((r.fsrs as StoredCard).reps ?? 0) % all.length];
};

function view(r: Row, now: Date, tz: string): Note {
	const card = r.fsrs as StoredCard;
	const next = dayDelta(localDay(now, tz), localDay(new Date(card.dueAt), tz));
	const due = availableAt(card) <= now.getTime() || next <= 0;
	const own = r.kind === "own";
	return {
		id: r.id,
		phrase: r.phrase,
		from: own ? "own" : "collected",
		where: own ? (r.title ?? "") : "",
		...(own && r.pieceId ? { whereHref: `/w/${r.pieceId}` } : {}),
		due,
		...(due ? {} : { next }),
		gloss: r.meaning,
		...(r.register ? { register: r.register as Register } : {}),
		...((own ? r.usage : r.why) ? { usage: (own ? r.usage : r.why) ?? undefined } : {}),
		examples: Examples.parse(r.examples) as Example[],
		...(own ? { before: r.was ?? undefined, final: r.sentence ?? undefined } : { sentence: r.sentence ?? undefined, marked: r.marked ?? undefined }),
		card: faceOf(r),
	};
}

const rowsOf = (rows: { n: typeof note.$inferSelect; title: string | null }[]): Row[] => rows.map((x) => ({ ...x.n, title: x.title }));

/** The learner's entries in a language, newest first. */
export async function notesOf(u: Learner, language: string, now = new Date()): Promise<Note[]> {
	const rows = await db
		.select(columns)
		.from(note)
		.leftJoin(piece, eq(piece.id, note.pieceId))
		.where(and(eq(note.userId, u.id), eq(note.language, language), isNull(note.deletedAt)))
		.orderBy(desc(note.createdAt));
	return rowsOf(rows).map((r) => view(r, now, zoneOf(u)));
}

export async function noteOf(u: Learner, id: string, now = new Date()): Promise<Note | null> {
	const [row] = await db.select(columns).from(note).leftJoin(piece, eq(piece.id, note.pieceId)).where(mine(u.id, id));
	return row ? view(rowsOf([row])[0], now, zoneOf(u)) : null;
}

export async function editNote(u: Learner, id: string, set: { phrase: string; gloss: string }) {
	await db.update(note).set({ phrase: set.phrase, meaning: set.gloss }).where(mine(u.id, id));
}

/** A deleted entry leaves the notebook and review; its row stays with its review history until the account goes. */
export async function deleteNotes(u: Learner, ids: string[]) {
	if (!ids.length) return;
	await db
		.update(note)
		.set({ deletedAt: new Date() })
		.where(and(eq(note.userId, u.id), inArray(note.id, ids), isNull(note.deletedAt)));
}

/** The entries review can ask now: learning cards due (or within learn ahead), then reviews, then new ones. */
function available(userId: string, language: string, now: Date) {
	const ahead = new Date(now.getTime() + LEARN_AHEAD_MS);
	return and(
		eq(note.userId, userId),
		eq(note.language, language),
		isNull(note.deletedAt),
		or(lte(note.due, now), and(lte(note.due, ahead), sql`${note.fsrs}->>'state' in ('1', '3')`)),
	);
}
const QUEUE_ORDER = [sql`case ${note.fsrs}->>'state' when '1' then 0 when '3' then 0 when '2' then 1 else 2 end`, asc(note.due), asc(note.id)];
const SITTING = 200;

export async function queueOf(u: Learner, language: string, now = new Date()): Promise<ReviewCard[]> {
	const rows = await db
		.select(columns)
		.from(note)
		.leftJoin(piece, eq(piece.id, note.pieceId))
		.where(available(u.id, language, now))
		.orderBy(...QUEUE_ORDER)
		.limit(SITTING);
	return rowsOf(rows).map((r) => {
		const card = r.fsrs as StoredCard;
		const own = r.kind === "own";
		return {
			...faceOf(r),
			id: r.id,
			kind: own ? "own" : "collected",
			where: own ? (r.title ?? "") : "",
			...((own ? r.usage : r.why) ? { why: (own ? r.usage : r.why) ?? undefined } : {}),
			phrase: r.phrase,
			queue: queueKind(card),
			outcomes: preview(card, now),
			...(queueKind(card) === "learning" ? { dueIn: Math.max(0, Date.parse(card.dueAt) - now.getTime()) } : {}),
		};
	});
}

export async function dueOf(u: Learner, language: string, now = new Date()): Promise<DueSummary> {
	const [[{ count }], first] = await Promise.all([
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(note)
			.where(available(u.id, language, now)),
		db
			.select({ phrase: note.phrase, kind: note.kind, title: piece.title })
			.from(note)
			.leftJoin(piece, eq(piece.id, note.pieceId))
			.where(available(u.id, language, now))
			.orderBy(...QUEUE_ORDER)
			.limit(2),
	]);
	return { count, first: first.map((f) => ({ phrase: f.phrase, where: f.kind === "own" ? (f.title ?? "") : "" })) };
}

/**
 * A rating, written with its log. A card that leaves the sitting and leaves nothing to review in its language clears
 * the reviews: today's half. Returns where the card is now and what each rating would do from there.
 */
export async function rateNote(u: Learner, id: string, rating: RatingName, verdict: Verdict | null, elapsedSeconds: number, now = new Date()) {
	return db.transaction(async (tx) => {
		const [row] = await tx.select().from(note).where(mine(u.id, id)).for("update");
		if (!row) error(404, "No such entry.");
		const before = row.fsrs as StoredCard;
		// The page rates without waiting; a card is never asked before learn ahead lets it in.
		if (availableAt(before) > now.getTime() + 60_000) error(409, "Not due yet.");
		const after = rate(before, rating, now, zoneOf(u));
		await tx
			.update(note)
			.set({ fsrs: after, due: new Date(after.dueAt) })
			.where(eq(note.id, id));
		await tx.insert(reviewLog).values({
			noteId: id,
			userId: u.id,
			rating: ["again", "hard", "good", "easy"].indexOf(rating) + 1,
			verdict,
			elapsedSeconds,
			prev: before,
			next: after,
			reviewedAt: now,
		});
		const queue = queueKind(after);
		const cleared = queue !== "learning" && (await queueEmpty(tx, u.id, row.language, now));
		if (cleared) await credit(tx, u, "reviewed", row.language, now);
		return { queue, outcomes: preview(after, now), cleared };
	});
}
