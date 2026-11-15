import { app } from "#lib/account/app.svelte.ts";
import type { Note, ReviewCard } from "#lib/notebook/types.ts";
import { noteFaces } from "#lib/review/faces.ts";
import type { DayKind, WeekView } from "#lib/week/types.ts";
import type { PieceItem, PieceResult } from "#lib/writing/types.ts";
import { notesPending } from "#lib/writing/types.ts";

/*
 * The tour's sandbox: while the tour plays, the pages read and write this instead of the learner's own data, starting
 * from each chapter's stand-ins, and it is thrown away when the tour ends, so nothing the learner has is read or
 * touched and no request the tour makes reaches the database (the tape answers the model's part, tape.ts). It lives in
 * the browser's memory only; on the server there is never a tour.
 */

/** A piece the tour finished (with what its page shows). */
export type TourPiece = PieceItem & { result?: PieceResult };
/** A phrase the tour collected, with the sentence it was read in. */
export type Collected = {
	phrase: string;
	meaning: string;
	register?: string;
	examples?: string[];
	example?: string;
	why?: string;
	lang: string;
	at: number;
	sentence?: string;
	marked?: string;
	batch?: string;
};
export type NoteEdit = { phrase?: string; gloss?: string; deleted?: boolean };
type Half = "learned" | "reviewed" | "both";
/** What the week's glass last played (Week.svelte), so a chapter can start from a glass already seen. */
export type GlassSeen = { day: string; look: "down" | "up" | "full"; drink: string };

export type Sandbox = {
	pieces: TourPiece[];
	collected: Collected[];
	edits: Record<string, NoteEdit>;
	days: Record<string, Half>;
	glass: GlassSeen | null;
	/** A passage pasted to collect from, by its id (the collect page's `?reading=`). */
	readings: Record<string, { passage: string; lang: string }>;
};

let box = $state<Sandbox | null>(null);
export const sandboxed = () => box !== null;
export function enterSandbox(seed: Partial<Sandbox>) {
	box = { pieces: [], collected: [], edits: {}, days: {}, glass: null, readings: {}, ...seed };
}
export function leaveSandbox() {
	box = null;
}
const the = () => box as Sandbox;

/* ---------- Pieces ---------- */
export const tourPieces = (): TourPiece[] =>
	(box?.pieces ?? []).map((w) => ({
		...w,
		finishedAt: w.finishedAt ?? w.result?.finishedAt,
		learned: w.learned ?? w.result?.learned,
		notesPending: w.notesPending ?? w.result?.notesPending,
	}));
export const tourPiece = (id: string) => tourPieces().find((w) => w.id === id);
export function recordTourPiece(entry: Partial<TourPiece> & { id: string }) {
	const all = the().pieces;
	const at = all.findIndex((w) => w.id === entry.id);
	if (at >= 0) all[at] = { ...all[at], ...entry };
	else all.push({ title: "", site: "", lang: app.lang, open: false, at: Date.now(), ...entry } as TourPiece);
}

/* ---------- Collecting ---------- */
export function keepReading(id: string, passage: string, lang: string) {
	the().readings[id] = { passage, lang };
}
export const tourReading = (id: string) => {
	const r = box?.readings[id];
	return r ? { id, ...r } : null;
};
/** What one sitting of collecting kept (`batch`), replacing what it kept before. */
export function keepCollected(batch: string, items: Omit<Collected, "batch" | "at">[]) {
	const s = the();
	s.collected = [...s.collected.filter((c) => c.batch !== batch), ...items.map((c) => ({ ...c, batch, at: Date.now() }))];
}
/** A collected phrase's id: stable across visits, from the reading it was kept in and the words kept. */
function collectedId(c: Collected) {
	let h = 5381;
	for (const ch of `${c.batch ?? c.at}|${c.phrase}`) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
	return `c-${h.toString(36)}`;
}

/* ---------- The notebook and review ---------- */
/** What each rating does to a card the sandbox asks (a new one): the scheduler's first steps. */
const FIRST: ReviewCard["outcomes"] = {
	again: { label: "1m", stays: true, inMs: 60_000 },
	hard: { label: "6m", stays: true, inMs: 360_000 },
	good: { label: "10m", stays: true, inMs: 600_000 },
	easy: { label: "4d", stays: false, inMs: 4 * 864e5 },
};
/** The sandbox's review cards: each phrase it collected, asked in the sentence it was read in. */
export function tourDeck(): ReviewCard[] {
	const edits = box?.edits ?? {};
	return (box?.collected ?? [])
		.filter((c) => c.lang === app.lang && c.sentence && c.marked && c.sentence.includes(c.marked))
		.map((c): ReviewCard => {
			const id = collectedId(c);
			return {
				id,
				kind: "collected",
				where: "",
				text: c.sentence as string,
				answer: c.marked as string,
				cue: edits[id]?.gloss ?? c.meaning,
				phrase: edits[id]?.phrase ?? c.phrase,
				queue: "new",
				outcomes: FIRST,
			};
		})
		.filter((c) => !edits[c.id]?.deleted);
}
/** The sandbox's notebook: the phrases it collected, then the entries of the pieces it finished. */
export function tourNotebook(): Note[] {
	const edits = box?.edits ?? {};
	const deck = tourDeck();
	const read = (box?.collected ?? [])
		.filter((c) => c.lang === app.lang)
		.toReversed()
		.map((c): Note => {
			const id = collectedId(c);
			return {
				id,
				phrase: c.phrase,
				from: "collected",
				where: "",
				due: true,
				gloss: c.meaning,
				register: c.register as Note["register"],
				examples: (c.examples ?? (c.example ? [c.example] : [])).map((t) => ({ t })),
				sentence: c.sentence,
				marked: c.marked,
				card: deck.find((d) => d.id === id),
			};
		});
	const own = tourPieces()
		.filter((w) => w.lang === app.lang && w.finishedAt && !notesPending(w))
		.flatMap((w) =>
			(w.learned ?? []).map(
				(l, i): Note => ({
					id: `o-${w.id}-${i}`,
					phrase: l.note?.phrase ?? l.text,
					from: "own",
					where: w.title,
					whereHref: `/w/${w.id}`,
					before: l.before,
					final: l.final,
					due: false,
					next: 1,
					gloss: l.note?.meaning ?? "",
					usage: l.note?.usage,
					examples: l.note?.examples,
				}),
			),
		);
	return [...read, ...own]
		.filter((n) => !edits[n.id]?.deleted)
		.map((n) => ({ ...n, phrase: edits[n.id]?.phrase ?? n.phrase, gloss: edits[n.id]?.gloss ?? n.gloss }))
		.map((n) => ({ ...n, card: n.card ?? noteFaces({ ...n, kind: n.from })[0] }));
}
export function editTourNote(id: string, edit: NoteEdit) {
	const s = the();
	s.edits[id] = { ...s.edits[id], ...edit };
}

/* ---------- The week ---------- */
/** A day on this device, as the server names the learner's days: `YYYY-MM-DD`. */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Credits the sandbox's today with one half. */
export function practised(what: "learned" | "reviewed") {
	const s = the();
	const was = s.days[dayKey()];
	const learned = what === "learned" || was === "learned" || was === "both";
	const reviewed = what === "reviewed" || was === "reviewed" || was === "both" || tourDeck().length === 0;
	s.days[dayKey()] = learned && reviewed ? "both" : learned ? "learned" : "reviewed";
}
/** The sandbox's week, Monday first. */
export function tourWeek(now = new Date()): WeekView {
	const mon = (now.getDay() + 6) % 7;
	const days = box?.days ?? {};
	const KIND: Record<string, DayKind> = { both: "full", learned: "learned", reviewed: "reviewed" };
	return {
		today: dayKey(now),
		goal: app.prefs.weeklyGoal,
		days: Array.from({ length: 7 }, (_, i) => {
			const d = new Date(now);
			d.setDate(now.getDate() - mon + i);
			return { day: dayKey(d), kind: i > mon ? "later" : (KIND[days[dayKey(d)]] ?? "none") };
		}),
	};
}
export const tourGlass = () => box?.glass ?? null;
export function keepTourGlass(seen: GlassSeen) {
	the().glass = seen;
}
