import { and, eq, inArray, max, ne } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { piece, pieceRevision, pieceStep } from "#lib/server/db/schema.ts";
import { learnerCaller } from "#lib/server/llm/callers.ts";
import { Lanes } from "#lib/server/llm/lanes.ts";
import { fileOwn } from "#lib/server/notebook/notes.ts";
import { credit } from "#lib/server/week/days.ts";
import { learnedFrom } from "#lib/server/writing/learned.ts";
import { type RevisionInput, RevisionSession, type RevisionState, SNAPSHOT_VERSION } from "./revision.ts";

/*
 * The revisions this process holds, by piece. The deployment is one process, so a revision lives in memory while it is
 * used; its snapshot is written with every step's row on the tape and again when a background call settles, so a
 * restart, an idle revision put away or another device picks it up where it was. An idle revision leaves memory after
 * thirty minutes; shutdown writes every snapshot first.
 */
type Learner = { id: string; helpImprove: boolean; timeZone?: string | null };
type Held = {
	userId: string;
	session: RevisionSession;
	/** The next step's number on the tape. */
	seq: number;
	/** The step in force, for the records of the calls it makes. */
	step: number | null;
	used: number;
	/** Snapshot writes, one after another; each writes the revision as it is when its turn comes. */
	writing: Promise<void>;
	pending: boolean;
	timer?: ReturnType<typeof setTimeout>;
	/** Something settled in the background: the snapshot is written again shortly. */
	changed: () => void;
};
const held = new Map<string, Held>();
const IDLE_MS = 30 * 60_000;
/** Background results settle in bursts; their snapshot waits a moment for the rest. */
const SETTLE_MS = 1000;

async function callerFor(user: Learner, pieceId: string, h: () => Held | undefined) {
	return learnerCaller({ user, pieceId, lanes: new Lanes(), step: () => h()?.step ?? null });
}

function hold(pieceId: string, userId: string, session: RevisionSession, seq: number): Held {
	const h: Held = { userId, session, seq, step: null, used: Date.now(), writing: Promise.resolve(), pending: false, changed: () => {} };
	h.changed = () => {
		clearTimeout(h.timer);
		h.timer = setTimeout(() => save(pieceId, h), SETTLE_MS);
	};
	session.onChange = h.changed;
	held.set(pieceId, h);
	return h;
}

/** Write the revision's snapshot (queued behind any write under way, and skipped if one is already queued). */
function save(pieceId: string, h: Held) {
	clearTimeout(h.timer);
	if (h.pending) return h.writing;
	h.pending = true;
	h.writing = h.writing
		.then(async () => {
			h.pending = false;
			const state = h.session.snapshot();
			await db
				.insert(pieceRevision)
				.values({ pieceId, version: SNAPSHOT_VERSION, state })
				.onConflictDoUpdate({ target: pieceRevision.pieceId, set: { version: SNAPSHOT_VERSION, state } });
		})
		.catch((e) => console.error(`revision ${pieceId}: snapshot failed:`, e));
	return h.writing;
}

/** A new piece of the learner's writing with its revision, or a fresh revision of one of their unfinished pieces. */
export async function startRevision(
	user: Learner & { activeLanguage?: string | null },
	input: RevisionInput,
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
	if (id) {
		const [row] = await db
			.select({ state: piece.state })
			.from(piece)
			.where(and(eq(piece.id, id), eq(piece.userId, user.id)));
		if (!row || row.state === "finished") id = undefined;
	}
	const fields = {
		text: input.text,
		background: input.background ?? null,
		context: input.source ?? null,
		tutorLanguage: input.feedback === "target" ? (meta.language ?? "en") : input.learner,
		detail: input.detail ?? "needed",
		state: "revising",
	};
	if (id) await db.update(piece).set(fields).where(eq(piece.id, id));
	else {
		const [row] = await db
			.insert(piece)
			.values({
				userId: user.id,
				language: meta.language ?? user.activeLanguage ?? "en",
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
	const [last] = await db
		.select({ seq: max(pieceStep.seq) })
		.from(pieceStep)
		.where(eq(pieceStep.pieceId, pieceId));
	const prev = held.get(pieceId);
	if (prev) clearTimeout(prev.timer);
	let h: Held | undefined;
	const ai = await callerFor(user, pieceId, () => h);
	h = hold(pieceId, user.id, new RevisionSession(input, ai), (last?.seq ?? -1) + 1);
	await record(pieceId, h, "create", input, {}, null, 0);
	return pieceId;
}

/** The learner's revision of a piece: in memory, or loaded from its snapshot. Null when they have none there. */
export async function openRevision(user: Learner, pieceId: string): Promise<Held | null> {
	const h = held.get(pieceId);
	if (h) {
		if (h.userId !== user.id) return null;
		h.used = Date.now();
		return h;
	}
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
	if (again) return again;
	loaded = hold(pieceId, user.id, RevisionSession.restore(row.state as RevisionState, ai), (last?.seq ?? -1) + 1);
	return loaded;
}

/** One action of the page, on the tape with what it answered, and the snapshot written after it. */
export async function act<T>(pieceId: string, h: Held, action: string, body: unknown, run: (s: RevisionSession) => Promise<T>): Promise<T> {
	const seq = h.seq++;
	h.step = seq;
	h.used = Date.now();
	const t0 = Date.now();
	try {
		const out = await run(h.session);
		await record(pieceId, h, action, body, out ?? {}, null, Date.now() - t0, seq);
		return out;
	} catch (e) {
		await record(pieceId, h, action, body, null, String((e as Error)?.message ?? e), Date.now() - t0, seq);
		throw e;
	}
}

async function record(pieceId: string, h: Held, action: string, body: unknown, response: unknown, error: string | null, ms: number, seq = h.seq++) {
	try {
		await db.insert(pieceStep).values({ pieceId, seq, action, body: body ?? {}, response, error, ms });
	} catch (e) {
		console.error(`revision ${pieceId}: step ${seq} not written:`, e);
	}
	await save(pieceId, h);
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
 * then; it shows what pass 2 reworked meanwhile). The call is a step on the tape. Once they are filed, or there is no
 * revision left to ask, the revision is not needed again.
 */
const filing = new Set<string>();
export async function fileNotes(user: Learner, pieceId: string) {
	if (filing.has(pieceId)) return;
	filing.add(pieceId);
	try {
		const h = await openRevision(user, pieceId);
		const ask = h?.session.noteAsk;
		if (!h || !ask) {
			await updatePiece(pieceId, { notesRequestedAt: null });
			return;
		}
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
		// The stand-in stays; the piece's page asks again once the wait is over.
		console.error(`piece ${pieceId}: notes not filed:`, e);
	} finally {
		filing.delete(pieceId);
	}
}

/** Once the piece is finished and its notes are filed, its revision is not needed again. */
export async function dropRevision(pieceId: string) {
	const h = held.get(pieceId);
	if (h) {
		clearTimeout(h.timer);
		await h.writing;
		held.delete(pieceId);
	}
	await db.delete(pieceRevision).where(eq(pieceRevision.pieceId, pieceId));
}

/** Idle revisions leave memory (their snapshot written first). */
setInterval(() => {
	const now = Date.now();
	for (const [id, h] of held)
		if (now - h.used > IDLE_MS)
			save(id, h).then(() => {
				if (now - h.used > IDLE_MS) held.delete(id);
			});
}, 60_000).unref();

/** Every snapshot written, for shutdown. */
export async function flushRevisions() {
	await Promise.all([...held].map(([id, h]) => save(id, h)));
}

/** Development only: the revision thrown away and loaded again from its snapshot (lab/replay.mjs --reload). */
export function reloadRevision(h: Held) {
	h.session = RevisionSession.restore(JSON.parse(JSON.stringify(h.session.snapshot())), h.session.ai);
	h.session.onChange = h.changed;
}

/** The revision of a piece if this process holds it (the debug calls watch only what is running). */
export const heldRevision = (pieceId: string, userId: string) => {
	const h = held.get(pieceId);
	return h?.userId === userId ? h : null;
};
