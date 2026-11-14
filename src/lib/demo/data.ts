import type { ReviewCard } from "#lib/notebook/types.ts";
import type { DayKind, WeekView } from "#lib/week/types.ts";
import type { PieceItem, PieceResult } from "#lib/writing/types.ts";
import { writing } from "#lib/writing/writing.svelte.ts";
import { app, read, sandboxed, tx, write } from "./app.svelte";

/* ---------- Sites a piece can be for, with their cover colours (light stamp, dark band) and drawing ---------- */
export type SiteArt = "quill" | "bubble" | "letter" | "hash" | "chat" | "cards";
export const SITES: Record<string, { tone: string; deep: string; art: SiteArt }> = {
	AO3: { tone: "#ebcece", deep: "#5c2f2b", art: "quill" },
	Reddit: { tone: "#e3dacc", deep: "#6a4a2c", art: "bubble" },
	Email: { tone: "#cde2fb", deep: "#2f4660", art: "letter" },
	Discord: { tone: "#dfdbfd", deep: "#3a3955", art: "hash" },
	iMessage: { tone: "#bcd1ca", deep: "#33483f", art: "chat" },
	Translate: { tone: "#cbcadb", deep: "#4a4458", art: "cards" },
};
export const siteOf = (name: string | undefined) =>
	SITES[name ?? ""] ??
	SITES[
		Object.keys(SITES).find((k) =>
			String(name ?? "")
				.toLowerCase()
				.includes(k.toLowerCase()),
		) ?? "Email"
	];

/* ---------- The learner's writing ---------- */
/** What a scenario's page hands the revision when the learner comes back to a piece set aside (phase 4 moves these
 *  to the server). */
export type Handoff = {
	text: string;
	background?: string;
	source?: string;
	lang: string;
	learner: string;
	feedback: string;
};
/**
 * A piece in the lists. The server keeps the learner's pieces (lib/writing); this device still keeps a scenario set
 * aside before its revision began (with the handoff to start it), and the tour's pieces in its sandbox (with the result
 * its page shows).
 */
export type Writing = PieceItem & { handoff?: Handoff; result?: PieceResult };
export type { Learned, NoteBody, PieceResult } from "#lib/writing/types.ts";
export { notesPending } from "#lib/writing/types.ts";

export const WRITING_KEY = "myWriting";
const PIECE_ID = /^[0-9a-f-]{36}$/;
/** What this device keeps, as the lists read it (a piece with a server id is the server's, never this device's). */
function kept(): Writing[] {
	return read<Writing[]>(WRITING_KEY, [])
		.filter((w) => sandboxed() || !PIECE_ID.test(w.id))
		.map((w) => ({
			...w,
			at: w.at ?? 0,
			open: !!w.open,
			finishedAt: w.finishedAt ?? w.result?.finishedAt,
			learned: w.learned ?? w.result?.learned,
			notesPending: w.notesPending ?? w.result?.notesPending,
		}));
}
/** The learner's pieces in the language being worked in, newest first. */
export function myWriting(): Writing[] {
	void app.version;
	const server = sandboxed() ? [] : writing.list;
	return [...server, ...kept()].filter((w) => w.lang === app.lang).sort((x, y) => y.at - x.at);
}
/** One piece this device keeps, by its id (the tour's, in its sandbox). */
export function keptPiece(id: string): Writing | undefined {
	void app.version;
	return kept().find((w) => w.id === id);
}
export function recordWriting(entry: Partial<Writing> & { id: string }) {
	const all = read<Writing[]>(WRITING_KEY, []);
	const at = all.findIndex((w) => w.id === entry.id);
	if (at >= 0) all[at] = { ...all[at], ...entry };
	else all.push({ title: "", site: "", lang: app.lang, open: false, at: Date.now(), ...entry });
	write(WRITING_KEY, all);
	app.touch();
}
/** When a piece was last touched, as a list says it: today, yesterday, or the date. */
export function whenOf(w: Writing): string {
	const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(w.at).setHours(0, 0, 0, 0)) / 864e5);
	return days === 0
		? tx("when_today")
		: days === 1
			? tx("when_yesterday")
			: new Intl.DateTimeFormat(app.lang, { month: "short", day: "numeric" }).format(w.at);
}
export const COLLECT_KEY = "rehearsal:collect";

/* ---------- The tour's sandbox: its notebook, review and week ---------- */
/* The learner's own are the server's (lib/notebook, lib/week); while the tour plays, these stand in, from what its
   sandbox holds: phrases it collected (Collected), the days it practised. Phase 6 moves the tour onto the real pages. */
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
	passage?: string;
	batch?: string;
};
export const COLLECTED_KEY = "collected";
export const collected = (): Collected[] => {
	void app.version;
	return read<Collected[]>(COLLECTED_KEY, []);
};
/* ---------- Notebook entries the learner edited or deleted in the sandbox, laid over what they came from ---------- */
export type NoteEdit = { phrase?: string; gloss?: string; deleted?: boolean };
export const NOTE_EDITS = "noteEdits";
export const noteEdits = () => read<Record<string, NoteEdit>>(NOTE_EDITS, {});
/** A collected phrase's id: stable across visits, from the reading it was kept in and the words kept. */
export function collectedId(c: Collected) {
	let h = 5381;
	for (const ch of `${c.batch ?? c.at}|${c.phrase}`) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
	return `c-${h.toString(36)}`;
}

/** What each rating does to a card the sandbox asks (a new one): the scheduler's first steps. */
const FIRST: ReviewCard["outcomes"] = {
	again: { label: "1m", stays: true, inMs: 60_000 },
	hard: { label: "6m", stays: true, inMs: 360_000 },
	good: { label: "10m", stays: true, inMs: 600_000 },
	easy: { label: "4d", stays: false, inMs: 4 * 864e5 },
};
/** The sandbox's review cards: each phrase it collected, asked in the sentence it was read in. */
export function sandboxDeck(): ReviewCard[] {
	void app.version;
	const edits = noteEdits();
	return collected()
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

const PRACTICE = "practiceDays";
/** A day on this device, as the server names the learner's days: `YYYY-MM-DD`. */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Credits the sandbox's today with one half (the tour). */
export function practised(what: "learned" | "reviewed") {
	const all = read<Record<string, string>>(PRACTICE, {});
	const was = all[dayKey()];
	const learned = what === "learned" || was === "learned" || was === "both";
	const reviewed = what === "reviewed" || was === "reviewed" || was === "both" || sandboxDeck().length === 0;
	all[dayKey()] = learned && reviewed ? "both" : learned ? "learned" : "reviewed";
	write(PRACTICE, all);
	app.touch();
}
/** The sandbox's week, Monday first. */
export function sandboxWeek(now = new Date()): WeekView {
	void app.version;
	const mon = (now.getDay() + 6) % 7;
	const all = read<Record<string, string>>(PRACTICE, {});
	const KIND: Record<string, DayKind> = { both: "full", learned: "learned", reviewed: "reviewed" };
	return {
		today: dayKey(now),
		goal: app.prefs.weeklyGoal,
		days: Array.from({ length: 7 }, (_, i) => {
			const d = new Date(now);
			d.setDate(now.getDate() - mon + i);
			return { day: dayKey(d), kind: i > mon ? "later" : (KIND[all[dayKey(d)]] ?? "none") };
		}),
	};
}

/* ---------- Follow-up: the shelf's second slot ---------- */
/* One card at most, for one piece: first whether it was posted (a day after it was finished, not again for a day after
   "not yet"), then, three days on, writing it again from memory. */
export type FollowUp = { kind: "posted" | "again"; w: Writing };
export function followUp(now = Date.now()): FollowUp | undefined {
	const done = myWriting().filter((w) => w.finishedAt);
	// A scenario's piece was sent in the simulation already: nothing to ask about posting.
	const ask = done.find((w) => !w.scenarioId && (!w.posted || (w.posted === "not-yet" && now - (w.askedAt ?? 0) > 864e5)));
	if (ask && !(ask.posted === "not-yet")) return { kind: "posted", w: ask };
	const again = done.find((w) => !w.again && now - (w.finishedAt ?? now) >= 3 * 864e5 - 36e5);
	if (again) return { kind: "again", w: again };
	return ask ? { kind: "posted", w: ask } : undefined;
}
