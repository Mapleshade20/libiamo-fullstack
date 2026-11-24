import { error } from "@sveltejs/kit";
import { and, asc, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Register, Verdict } from "#lib/constants.ts";
import type { DueSummary, Example, Note, NotebookGlance, NotebookPage, NoteFrom, NoteRow, ReviewCard } from "#lib/notebook/types.ts";
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
				marked: l.note.marked ?? null,
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
/** A passage pasted to collect from, kept before anything is highlighted in it. */
export async function addReading(userId: string, text: string, language: string, place?: string): Promise<string> {
	const [r] = await db
		.insert(reading)
		.values({ userId, language, text, place: place || null })
		.returning({ id: reading.id });
	return r.id;
}

/** A phrase already collected from a reading, as the collect page marks it again. */
export type Kept = Omit<Collected, "span"> & { id: string };

/** One of the learner's readings, as the collect page opens it, with what is still kept from it. */
export async function readingOf(userId: string, id: string): Promise<{ id: string; passage: string; lang: string; kept: Kept[] } | null> {
	const [r] = await db
		.select({ id: reading.id, passage: reading.text, lang: reading.language })
		.from(reading)
		.where(and(eq(reading.id, id), eq(reading.userId, userId)));
	if (!r) return null;
	const rows = await db
		.select({
			id: note.id,
			phrase: note.phrase,
			meaning: note.meaning,
			register: note.register,
			why: note.why,
			examples: note.examples,
			marked: note.marked,
			sentence: note.sentence,
		})
		.from(note)
		.where(and(eq(note.readingId, id), eq(note.userId, userId), isNull(note.deletedAt)))
		.orderBy(note.id);
	const kept = rows.map(({ examples, ...n }) => ({
		...n,
		register: (n.register ?? "neutral") as Register,
		why: n.why ?? "",
		example: (examples as { t?: string }[])[0]?.t ?? "",
		marked: n.marked ?? n.phrase,
		sentence: n.sentence ?? "",
	}));
	return { ...r, kept };
}

type ReadingIn = { id?: string; text: string; language: string; place?: string };
/** The reading a page names, if it is the learner's. */
export async function ownReading(userId: string, id: string | undefined, w: typeof db | Tx = db): Promise<string | null> {
	if (!id) return null;
	const [mine] = await w
		.select({ id: reading.id })
		.from(reading)
		.where(and(eq(reading.id, id), eq(reading.userId, userId)));
	return mine?.id ?? null;
}

/** The reading a page names when it is the learner's, else a new one of what they pasted. */
export async function readingFor(userId: string, r: ReadingIn, w: typeof db | Tx = db): Promise<string> {
	const mine = await ownReading(userId, r.id, w);
	if (mine) return mine;
	const [made] = await w
		.insert(reading)
		.values({ userId, language: r.language, text: r.text, place: r.place || null })
		.returning({ id: reading.id });
	return made.id;
}

/**
 * Phrases filled in from something the learner read, each kept the moment it is: the reading first (once), then an entry
 * for each. Returns the reading and the entries' ids, in order.
 */
export async function fileCollected(
	u: WeekLearner,
	r: ReadingIn & { tutorLanguage: string },
	items: Collected[],
	now = new Date(),
): Promise<{ readingId: string; ids: string[] }> {
	return db.transaction(async (tx) => {
		const readingId = await readingFor(u.id, r, tx);
		if (!items.length) return { readingId, ids: [] };
		// One at a time: a phrase already kept from the same words (another tab, an earlier visit) is not kept twice, and
		// its entry's id comes back instead.
		const ids: string[] = [];
		for (const it of items) {
			const card = newCard(now, zoneOf(u));
			const [row] = await tx
				.insert(note)
				.values({
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
				})
				.onConflictDoNothing()
				.returning({ id: note.id });
			const [kept] = row
				? [row]
				: await tx
						.select({ id: note.id })
						.from(note)
						.where(
							and(
								eq(note.readingId, readingId),
								eq(note.marked, it.marked),
								sql`coalesce(${note.sentence}, '') = ${it.sentence || ""}`,
								isNull(note.deletedAt),
							),
						);
			if (!kept) throw new Error("a collected phrase was neither kept nor found");
			ids.push(kept.id);
		}
		return { readingId, ids };
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

/** An entry as its row in the list shows it: the phrase, its meaning, where it came from, and when it is asked next. */
function rowView(r: Pick<Row, "id" | "phrase" | "kind" | "meaning" | "fsrs" | "pieceId" | "title">, now: Date, tz: string): NoteRow {
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
	};
}

function view(r: Row, now: Date, tz: string): Note {
	const own = r.kind === "own";
	return {
		...rowView(r, now, tz),
		...(r.register ? { register: r.register as Register } : {}),
		...((own ? r.usage : r.why) ? { usage: (own ? r.usage : r.why) ?? undefined } : {}),
		examples: Examples.parse(r.examples) as Example[],
		...(own ? { before: r.was ?? undefined, final: r.sentence ?? undefined } : { sentence: r.sentence ?? undefined }),
		marked: r.marked ?? undefined,
		card: faceOf(r),
	};
}

const rowsOf = (rows: { n: typeof note.$inferSelect; title: string | null }[]): Row[] => rows.map((x) => ({ ...x.n, title: x.title }));

/** How many entries a page of the notebook holds: more than a learner who writes now and then ever has. */
export const NOTEBOOK_PAGE = 100;

/**
 * A page of the learner's entries in a language, newest first (ids are uuidv7, so their order is the order they were
 * filed): the rows only, with `next` naming where the following page starts. An entry's usage, examples and review face
 * are its own page's (`noteOf`).
 */
export async function notebookPage(u: Learner, language: string, from: NoteFrom, after?: string, now = new Date()): Promise<NotebookPage> {
	const rows = await db
		.select({ id: note.id, phrase: note.phrase, kind: note.kind, meaning: note.meaning, fsrs: note.fsrs, pieceId: note.pieceId, title: piece.title })
		.from(note)
		.leftJoin(piece, eq(piece.id, note.pieceId))
		.where(
			and(
				eq(note.userId, u.id),
				eq(note.language, language),
				isNull(note.deletedAt),
				from === "all" ? undefined : eq(note.kind, from),
				after ? lt(note.id, after) : undefined,
			),
		)
		.orderBy(desc(note.id))
		.limit(NOTEBOOK_PAGE + 1);
	const page = rows.slice(0, NOTEBOOK_PAGE);
	const tz = zoneOf(u);
	return { rows: page.map((r) => rowView(r, now, tz)), ...(rows.length > NOTEBOOK_PAGE ? { next: page[page.length - 1].id } : {}) };
}

/** What other pages show of the notebook: how many entries there are, and the latest phrases. */
export async function notebookGlance(u: Learner, language: string, latest = 4): Promise<NotebookGlance> {
	const mineIn = and(eq(note.userId, u.id), eq(note.language, language), isNull(note.deletedAt));
	const [[{ count }], rows] = await Promise.all([
		db.select({ count: sql<number>`count(*)::int` }).from(note).where(mineIn),
		db.select({ phrase: note.phrase }).from(note).where(mineIn).orderBy(desc(note.id)).limit(latest),
	]);
	return { count, latest: rows.map((r) => r.phrase) };
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
export async function rateNote(
	u: Learner,
	id: string,
	rating: RatingName,
	verdict: Verdict | null,
	elapsedSeconds: number,
	now = new Date(),
	requestId?: string,
) {
	return db.transaction(async (tx) => {
		const [row] = await tx.select().from(note).where(mine(u.id, id)).for("update");
		if (!row) error(404, "No such entry.");
		if (requestId) {
			const [saved] = await tx
				.select()
				.from(reviewLog)
				.where(and(eq(reviewLog.requestId, requestId), eq(reviewLog.noteId, id), eq(reviewLog.userId, u.id)));
			if (saved) {
				// Another device may have rated it since this request committed. Return the current card,
				// never roll the browser back to a historical queue/outcomes on an idempotent retry.
				const after = row.fsrs as StoredCard;
				return { queue: queueKind(after), outcomes: preview(after, now), cleared: await queueEmpty(tx, u.id, row.language, now) };
			}
		}
		const before = row.fsrs as StoredCard;
		// The page rates without waiting; a card is never asked before learn ahead lets it in.
		if (availableAt(before) > now.getTime() + 60_000) error(409, "Not due yet.");
		const after = rate(before, rating, now, zoneOf(u));
		await tx
			.update(note)
			.set({ fsrs: after, due: new Date(after.dueAt) })
			.where(eq(note.id, id));
		await tx.insert(reviewLog).values({
			requestId,
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
