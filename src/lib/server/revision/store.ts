import { and, eq, exists, inArray, isNotNull, lt, max, ne, not, or, type SQL, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { exchange, exchangeMessage, piece, pieceRevision, pieceStep, sessionCase, user as users } from "#lib/server/db/schema.ts";
import { learnerCaller } from "#lib/server/llm/callers.ts";
import { Lanes } from "#lib/server/llm/lanes.ts";
import { fileOwn } from "#lib/server/notebook/notes.ts";
import { credit } from "#lib/server/week/days.ts";
import { learnedFrom, StandIn } from "#lib/server/writing/learned.ts";
import { building } from "$app/env";
import { LANGS, type Lang } from "./draft.ts";
import { type RevisionInput, RevisionSession, type RevisionState, SNAPSHOT_VERSION } from "./revision.ts";

/*
 * The revisions this process holds, by piece. The deployment is one process, so a revision lives in memory while it is
 * used; its snapshot is written with every step's row on the tape and again when a background call settles, so a
 * restart, an idle revision put away or another device picks it up where it was. An idle revision leaves memory after
 * thirty minutes; shutdown writes every snapshot first.
 */
type Learner = { id: string; helpImprove: boolean; timeZone?: string | null };
export type Held = {
	userId: string;
	session: RevisionSession;
	/** The next step's number on the tape. */
	seq: number;
	/** The step in force, for the records of the calls it makes. */
	step: number | null;
	used: number;
	/** Snapshot writes, one after another; each writes the revision as it is when its turn comes. */
	writing: Promise<void>;
	timer?: ReturnType<typeof setTimeout>;
	/** Something settled in the background: the snapshot is written again shortly. */
	changed: () => void;
};
const held = new Map<string, Held>();
const mutations = new Map<string, Promise<unknown>>();
function exclusive<T>(id: string, run: () => Promise<T>): Promise<T> {
	const next = (mutations.get(id) ?? Promise.resolve()).catch(() => {}).then(run);
	mutations.set(id, next);
	void next
		.finally(() => {
			if (mutations.get(id) === next) mutations.delete(id);
		})
		.catch(() => {});
	return next;
}
const IDLE_MS = 30 * 60_000;
/** Background results settle in bursts; their snapshot waits a moment for the rest. */
const SETTLE_MS = 1000;

async function callerFor(user: Learner, pieceId: string, h: () => Held | undefined) {
	return learnerCaller({ user, pieceId, lanes: new Lanes(), step: () => h()?.step ?? null });
}

function hold(pieceId: string, userId: string, session: RevisionSession, seq: number): Held {
	const h: Held = { userId, session, seq, step: null, used: Date.now(), writing: Promise.resolve(), changed: () => {} };
	h.changed = () => {
		if (held.get(pieceId) !== h) return;
		clearTimeout(h.timer);
		h.timer = setTimeout(() => {
			void exclusive(pieceId, () => save(pieceId, h)).catch((e) => console.error(`revision ${pieceId}: background save failed:`, e));
		}, SETTLE_MS);
	};
	session.onChange = h.changed;
	held.set(pieceId, h);
	return h;
}

type StepWrite = { seq: number; action: string; body: unknown; response: unknown; error: string | null; ms: number };
/** A step and the state it acknowledged have one commit. A retired session never writes again. */
function save(pieceId: string, h: Held, step?: StepWrite) {
	clearTimeout(h.timer);
	const writing = h.writing.then(async () => {
		if (held.get(pieceId) !== h) return;
		const state = h.session.snapshot();
		await db.transaction(async (tx) => {
			if (step) await tx.insert(pieceStep).values({ pieceId, ...step });
			await tx
				.insert(pieceRevision)
				.values({ pieceId, version: SNAPSHOT_VERSION, state })
				.onConflictDoUpdate({ target: pieceRevision.pieceId, set: { version: SNAPSHOT_VERSION, state } });
		});
	});
	// Keep the queue usable after a failed write, but let the caller observe the failure.
	h.writing = writing.catch(() => {});
	return writing;
}

async function retire(pieceId: string) {
	const h = held.get(pieceId);
	if (!h) return;
	held.delete(pieceId);
	clearTimeout(h.timer);
	h.session.onChange = () => {};
	h.session.ai.lanes?.discard(() => true);
	await h.writing;
}

/** A new piece of the learner's writing with its revision, or a fresh revision of one of their unfinished pieces. */
export async function startRevision(
	user: Learner & { activeLanguage?: string | null },
	handed: RevisionInput,
	meta: { language?: string; kind: "own" | "scenario" | "translation"; scenarioId?: string; title?: string; place?: string; pieceId?: string },
): Promise<string> {
	let id = meta.pieceId;
	// A scenario has at most one unfinished piece per learner: starting it again goes on in that one.
	if (!id && meta.scenarioId) {
		const [open] = await db
			.select({ id: piece.id })
			.from(piece)
			.where(and(eq(piece.userId, user.id), eq(piece.scenarioId, meta.scenarioId), inArray(piece.state, ["writing", "revising"])));
		id = open?.id;
	}
	let language = meta.language;
	if (id) {
		const [row] = await db
			.select({ state: piece.state, language: piece.language })
			.from(piece)
			.where(and(eq(piece.id, id), eq(piece.userId, user.id)));
		if (!row || row.state === "finished") id = undefined;
		else language ??= row.language;
	}
	language ??= user.activeLanguage ?? "en";
	// The scene does not guess the language again: it is the piece's.
	const input: RevisionInput = { ...handed, target: (LANGS as readonly string[]).includes(language) ? (language as Lang) : "en" };
	const fields = {
		text: input.text,
		background: input.background ?? null,
		context: input.source ?? null,
		tutorLanguage: input.feedback === "target" ? language : input.learner,
		detail: input.detail ?? "needed",
		state: "revising",
	};
	const existing = !!id;
	if (!id) {
		const [row] = await db
			.insert(piece)
			.values({
				userId: user.id,
				language,
				kind: meta.kind,
				scenarioId: meta.scenarioId ?? null,
				// Until the scene names it, a piece is called by its first words.
				title: meta.title ?? input.text.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 80),
				place: meta.place ?? "",
				...fields,
			})
			.returning({ id: piece.id });
		id = row.id;
	}
	const pieceId = id;
	return exclusive(pieceId, async () => {
		await retire(pieceId);
		if (existing) await db.update(piece).set(fields).where(eq(piece.id, pieceId));
		const [last] = await db
			.select({ seq: max(pieceStep.seq) })
			.from(pieceStep)
			.where(eq(pieceStep.pieceId, pieceId));
		let h: Held | undefined;
		const ai = await callerFor(user, pieceId, () => h);
		h = hold(pieceId, user.id, new RevisionSession(input, ai), (last?.seq ?? -1) + 1);
		await record(pieceId, h, "create", input, {}, null, 0);
		return pieceId;
	});
}

/**
 * The learner's revision of a piece: in memory, or loaded from its snapshot. Null when they have none there. One in
 * memory is answered at once, not in the piece's turn: an action can wait minutes on a model there, and a reload
 * (`resume`) or the bookmark must not wait behind it. `act` still refuses a revision replaced meanwhile.
 */
export async function openRevision(user: Learner, pieceId: string): Promise<Held | null> {
	const h = held.get(pieceId);
	if (h) return using(h, user);
	return exclusive(pieceId, async () => {
		const h = held.get(pieceId);
		if (h) return using(h, user);
		const [row] = await db
			.select({ version: pieceRevision.version, state: pieceRevision.state, userId: piece.userId })
			.from(pieceRevision)
			.innerJoin(piece, eq(piece.id, pieceRevision.pieceId))
			.where(eq(pieceRevision.pieceId, pieceId));
		if (!row || row.userId !== user.id || row.version !== SNAPSHOT_VERSION) return null;
		const [last] = await db
			.select({ seq: max(pieceStep.seq) })
			.from(pieceStep)
			.where(eq(pieceStep.pieceId, pieceId));
		let loaded: Held | undefined;
		const ai = await callerFor(user, pieceId, () => loaded);
		// Another request may have loaded it meanwhile.
		const again = held.get(pieceId);
		if (again) return using(again, user);
		loaded = hold(pieceId, user.id, RevisionSession.restore(row.state as RevisionState, ai), (last?.seq ?? -1) + 1);
		return loaded;
	});
}

function using(h: Held, user: Learner) {
	if (h.userId !== user.id) return null;
	h.used = Date.now();
	return h;
}

/** One action of the page, on the tape with what it answered, and the snapshot written after it. */
export async function act<T>(pieceId: string, h: Held, action: string, body: unknown, run: (s: RevisionSession) => Promise<T>): Promise<T> {
	return exclusive(pieceId, async () => {
		if (held.get(pieceId) !== h) throw new Error("This revision was replaced. Reload it before continuing.");
		await h.session.ai.resolved();
		const seq = h.seq++;
		h.step = seq;
		h.used = Date.now();
		const t0 = Date.now();
		let out: T;
		try {
			out = await run(h.session);
		} catch (e) {
			await record(pieceId, h, action, body, null, String((e as Error)?.message ?? e), Date.now() - t0, seq);
			throw e;
		}
		await record(pieceId, h, action, body, out ?? {}, null, Date.now() - t0, seq);
		return out;
	});
}

async function record(pieceId: string, h: Held, action: string, body: unknown, response: unknown, error: string | null, ms: number, seq = h.seq++) {
	try {
		await save(pieceId, h, { seq, action, body: body ?? {}, response, error, ms });
	} catch (e) {
		// Do not let a later action or background save commit state whose tape step was rolled back.
		await retire(pieceId);
		throw e;
	}
}

/** The learner's piece, as far as coming back to its revision needs it. */
export async function pieceFor(userId: string, pieceId: string) {
	const [row] = await db
		.select({ state: piece.state, language: piece.language, scenarioId: piece.scenarioId, title: piece.title, place: piece.place })
		.from(piece)
		.where(and(eq(piece.id, pieceId), eq(piece.userId, userId)));
	return row ?? null;
}

/** The page's bookmark kept with the revision: not a step of it, so not on the tape; the snapshot is written shortly. */
export function bookmark(h: Held, page: unknown) {
	h.used = Date.now();
	h.session.progress(page);
	h.changed();
}

/** Change what the piece's row says (the scene's title, the end); the revision itself is in the snapshot. */
export async function updatePiece(pieceId: string, set: Partial<typeof piece.$inferInsert>) {
	await db.update(piece).set(set).where(eq(piece.id, pieceId));
}

/**
 * The move to `finished`, guarded so it happens once: the transaction that wins it credits the day with what was learned
 * (design §5.2). Returns whether this call finished it.
 */
export async function finishPiece(user: Learner, pieceId: string, set: Partial<typeof piece.$inferInsert>): Promise<boolean> {
	return db.transaction(async (tx) => {
		const now = new Date();
		const [done] = await tx
			.update(piece)
			.set({ ...set, state: "finished", finishedAt: now })
			.where(and(eq(piece.id, pieceId), ne(piece.state, "finished")))
			.returning({ language: piece.language });
		if (done) await credit(tx, user, "learned", done.language, now);
		return !!done;
	});
}

/**
 * The notebook entries of a finished piece, written after its revision ended (the learner is on the piece's page by
 * then; it shows what pass 2 reworked meanwhile). The call is a step on the tape. A call that fails is tried again two
 * minutes on, by the sweep below, whether or not the page is still open; after the third, or with no revision left to
 * ask, what pass 2 reworked is filed as it stands, so a piece never ends with nothing in the notebook. Once its entries
 * are filed, the revision is not needed again.
 */
const filing = new Set<string>();
const NOTES_TRIES = 3;
export const NOTES_RETRY_MS = 120_000;
export async function fileNotes(user: Learner, pieceId: string) {
	if (filing.has(pieceId)) return;
	filing.add(pieceId);
	let tries = 0;
	try {
		const [p] = await db
			.update(piece)
			.set({ notesTries: sql`${piece.notesTries} + 1`, notesRequestedAt: new Date() })
			.where(and(eq(piece.id, pieceId), isNotNull(piece.notesRequestedAt)))
			.returning({ tries: piece.notesTries });
		if (!p) return;
		tries = p.tries;
		const h = await openRevision(user, pieceId);
		const ask = h?.session.noteAsk;
		if (!h || !ask) return await fileStandIns(user, pieceId);
		const notes = await act(pieceId, h, "notes", ask, (s) => s.notes(ask.items, ask.p1));
		const learned = learnedFrom(ask, notes);
		await db.transaction(async (tx) => {
			const [p] = await tx
				.update(piece)
				.set({ learned, notesRequestedAt: null })
				.where(eq(piece.id, pieceId))
				.returning({ id: piece.id, language: piece.language, tutorLanguage: piece.tutorLanguage });
			if (p) await fileOwn(tx, user, p, learned);
		});
		await dropRevision(pieceId);
	} catch (e) {
		console.error(`piece ${pieceId}: notes not filed (try ${tries}):`, e);
		if (tries >= NOTES_TRIES) await fileStandIns(user, pieceId).catch((e) => console.error(`piece ${pieceId}: stand-ins not filed:`, e));
	} finally {
		filing.delete(pieceId);
	}
}

/** What pass 2 reworked, filed as the piece's entries without a meaning (the learner can write one in the notebook). */
async function fileStandIns(user: Learner, pieceId: string) {
	await db.transaction(async (tx) => {
		const [p] = await tx
			.update(piece)
			.set({ notesRequestedAt: null })
			.where(and(eq(piece.id, pieceId), isNotNull(piece.notesRequestedAt)))
			.returning({ id: piece.id, language: piece.language, tutorLanguage: piece.tutorLanguage, learned: piece.learned });
		if (!p) return;
		const standIns = StandIn.catch([]).parse(p.learned);
		await fileOwn(
			tx,
			user,
			p,
			standIns.map((l) => ({ ...l, note: { phrase: l.text, meaning: "", usage: "", examples: [] } })),
		);
	});
	await dropRevision(pieceId);
}

/** Pieces whose entries are still not filed two minutes after they were last asked for are asked again. */
async function sweepNotes() {
	const due = await db
		.select({ id: piece.id, user: { id: users.id, helpImprove: users.helpImprove, timeZone: users.timeZone } })
		.from(piece)
		.innerJoin(users, eq(users.id, piece.userId))
		.where(lt(piece.notesRequestedAt, new Date(Date.now() - NOTES_RETRY_MS)))
		.limit(20);
	for (const p of due) void fileNotes(p.user, p.id);
}
if (!building) setInterval(() => sweepNotes().catch((e) => console.error("notes sweep failed:", e)), 30_000).unref();

/** Once the piece is finished and its notes are filed, its revision is not needed again. */
export async function dropRevision(pieceId: string) {
	return exclusive(pieceId, async () => {
		await retire(pieceId);
		await db.delete(pieceRevision).where(eq(pieceRevision.pieceId, pieceId));
	});
}

/**
 * Snapshots a finished piece no longer needs: its notes filed (or never asked for) more than a day ago. Normally
 * dropRevision has taken them; a replay, or a page that never asked for notes, leaves them behind (about 20 KB each).
 */
export async function pruneRevisions(now = new Date()) {
	const gone = await db
		.delete(pieceRevision)
		.where(
			inArray(
				pieceRevision.pieceId,
				db
					.select({ id: piece.id })
					.from(piece)
					.where(
						and(eq(piece.state, "finished"), sql`${piece.notesRequestedAt} is null`, lt(piece.finishedAt, new Date(now.getTime() - 86_400_000))),
					),
			),
		)
		.returning({ id: pieceRevision.pieceId });
	return gone.length;
}

/** How long an unfinished piece may go untouched before it is abandoned. */
export const ABANDON_DAYS = 30;

const one = { one: sql`1` };
const snapshotWhere = (...c: (SQL | undefined)[]) =>
	exists(
		db
			.select(one)
			.from(pieceRevision)
			.where(and(eq(pieceRevision.pieceId, piece.id), ...c)),
	);
/** A revision that can no longer be opened: no snapshot, or one an older version of the revision wrote. */
const unopenable = () => and(eq(piece.state, "revising"), not(snapshotWhere(eq(pieceRevision.version, SNAPSHOT_VERSION))));

/**
 * Pieces nobody will finish, as of `now`:
 * - in a revision: untouched for thirty days (its snapshot is written after every change), or one that can no longer be
 *   opened (an hour on: a revision's piece is written a moment before its first snapshot);
 * - a scenario's, its place closed (the worker closes it after 48 hours): at once when the learner wrote nothing in it,
 *   else thirty days after it closed or was taken up again;
 * - a translation taken up again and left on its sheet: thirty days after.
 * A translation being written is not a piece yet (its draft is on the learner's device).
 */
function stale(now: Date) {
	const before = new Date(now.getTime() - ABANDON_DAYS * 86_400_000);
	const settled = new Date(now.getTime() - 3_600_000);
	const closed = (...c: (SQL | undefined)[]) =>
		exists(
			db
				.select(one)
				.from(exchange)
				.where(and(eq(exchange.pieceId, piece.id), ne(exchange.status, "in_progress"), ...c)),
		);
	const said = exists(
		db
			.select(one)
			.from(exchangeMessage)
			.where(and(eq(exchangeMessage.exchangeId, exchange.id), eq(exchangeMessage.role, "user"))),
	);
	return or(
		and(
			eq(piece.state, "revising"),
			or(
				and(not(snapshotWhere()), lt(piece.updatedAt, settled)),
				snapshotWhere(ne(pieceRevision.version, SNAPSHOT_VERSION)),
				snapshotWhere(lt(pieceRevision.updatedAt, before)),
			),
		),
		and(
			eq(piece.state, "writing"),
			eq(piece.kind, "scenario"),
			or(closed(not(said)), and(closed(lt(exchange.completedAt, before)), lt(piece.updatedAt, before))),
		),
		and(eq(piece.state, "writing"), eq(piece.kind, "translation"), lt(piece.updatedAt, before)),
	);
}

/**
 * A piece left unfinished, abandoned: its state goes, what was written stays. The revision's snapshot and its tape go;
 * the text, the background, the context, a translation's assignment and a scenario's conversation stay, so it can be
 * taken up again (server/writing/take-up.ts). `still` is why (by default, a revision that can no longer be opened):
 * checked again in the piece's turn, so a learner who came back meanwhile keeps it, and never while its revision is in
 * memory (someone is in it; an idle one leaves memory within half an hour). Whether it was abandoned now.
 */
export async function abandon(pieceId: string, still: SQL | undefined = unopenable()): Promise<boolean> {
	return exclusive(pieceId, async () => {
		if (held.has(pieceId)) return false;
		return db.transaction(async (tx) => {
			const [p] = await tx
				.update(piece)
				.set({ state: "abandoned", notesRequestedAt: null })
				.where(and(eq(piece.id, pieceId), inArray(piece.state, ["writing", "revising"]), still))
				.returning({ id: piece.id });
			if (!p) return false;
			await tx.delete(pieceRevision).where(eq(pieceRevision.pieceId, pieceId));
			// An open case still reads its tape (pruneTapes takes it once the case is closed).
			await tx
				.delete(pieceStep)
				.where(
					and(
						eq(pieceStep.pieceId, pieceId),
						sql`not exists (select 1 from ${sessionCase} where ${sessionCase.pieceId} = ${pieceId} and ${sessionCase.status} = 'open')`,
					),
				);
			return true;
		});
	});
}

/** Pieces nobody will finish (`stale`), abandoned, at most `limit` at a time. */
export async function abandonStale(now = new Date(), limit = 200): Promise<number> {
	const ids = await db.select({ id: piece.id }).from(piece).where(stale(now)).limit(limit);
	let n = 0;
	for (const { id } of ids) if (await abandon(id, stale(now))) n++;
	return n;
}

/** How long a finished piece keeps its tape (design §5.7: as long as model call records). */
export const KEEP_TAPE_DAYS = 30;

/**
 * Tapes kept as model call records are (design §5.7): a finished piece's, once its notes are filed, thirty days after it
 * was finished, or at once when its learner does not help improve Libiamo (nobody reads theirs), and an abandoned
 * piece's at once; an open case holds a tape until it is closed. A piece's own page reads its row, never its tape;
 * only the admin and `case pull` do.
 */
export async function pruneTapes(now = new Date()) {
	const before = new Date(now.getTime() - KEEP_TAPE_DAYS * 86_400_000);
	const done = db
		.select({ id: piece.id })
		.from(piece)
		.innerJoin(users, eq(users.id, piece.userId))
		.where(
			and(
				or(
					and(eq(piece.state, "finished"), sql`${piece.notesRequestedAt} is null`, or(lt(piece.finishedAt, before), eq(users.helpImprove, false))),
					// An abandoned piece's tape was kept only for an open case.
					eq(piece.state, "abandoned"),
				),
				sql`not exists (select 1 from ${sessionCase} where ${sessionCase.pieceId} = ${piece.id} and ${sessionCase.status} = 'open')`,
			),
		);
	const gone = await db.delete(pieceStep).where(inArray(pieceStep.pieceId, done)).returning({ id: pieceStep.pieceId });
	return new Set(gone.map((g) => g.id)).size;
}

/**
 * Idle revisions leave memory, their snapshot written first. One whose snapshot cannot be written (its piece deleted
 * meanwhile) leaves all the same: the snapshot was written with its last step, and keeping it would only retry the write
 * every minute until a restart.
 */
export async function putAwayIdle(now = Date.now()) {
	const idle = [...held].filter(([, h]) => now - h.used > IDLE_MS);
	await Promise.all(
		idle.map(([id, h]) =>
			exclusive(id, async () => {
				if (held.get(id) !== h || now - h.used <= IDLE_MS) return;
				await save(id, h).catch((e) => console.error(`revision ${id}: idle save failed:`, e));
				await retire(id);
			}),
		),
	);
}
if (!building) setInterval(() => putAwayIdle().catch((e) => console.error("idle revisions not put away:", e)), 60_000).unref();

/**
 * A learner's revisions leave memory unwritten, before their account is deleted: a snapshot written after it would
 * refer to a piece that is gone. A step in flight finishes without writing (a retired revision never writes again).
 */
export function forgetLearner(userId: string) {
	for (const [id, h] of held) if (h.userId === userId) void retire(id);
}

/** Every snapshot written, for shutdown; one that fails is logged and does not stop the others. */
export async function flushRevisions() {
	const all = [...held];
	const done = await Promise.allSettled(all.map(([id, h]) => exclusive(id, () => save(id, h))));
	for (const [i, d] of done.entries()) if (d.status === "rejected") console.error(`revision ${all[i][0]}: not written at shutdown:`, d.reason);
}

/** Development only: the revision thrown away and loaded again from its snapshot (lab/replay.mjs --reload). */
export function reloadRevision(h: Held) {
	h.session.onChange = () => {};
	h.session = RevisionSession.restore(JSON.parse(JSON.stringify(h.session.snapshot())), h.session.ai);
	h.session.onChange = h.changed;
}

/** The revision of a piece if this process holds it (the debug calls watch only what is running). */
export const heldRevision = (pieceId: string, userId: string) => {
	const h = held.get(pieceId);
	return h?.userId === userId ? h : null;
};
