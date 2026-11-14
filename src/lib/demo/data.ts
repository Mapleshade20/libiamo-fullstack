import type { Face } from "#lib/review/faces.ts";
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

/* ---------- Review: two kinds of card, by where the phrase came from ---------- */
/* From the learner's own writing: their sentence with the part they reworked marked, to say again. From reading: the
   sentence they met it in with the words they highlighted blanked, and what it means as the cue. Either way they answer
   before they see it. Cues are the tutor's to say, in the tutor's language. */
type Local = Record<string, string>;
type DeckCard =
	| { id: string; kind: "own"; where: string; text: string; part: string; answer: string; also: string[]; why: Local }
	| { id: string; kind: "collected"; where: string; text: string; answer: string; cue: Local | string; phrase?: string };
const DECK: Record<string, DeckCard[]> = {
	en: [
		{
			id: "r1",
			kind: "own",
			where: "your Reddit post",
			text: "When StarClan didn't show up, he went really miserable and furious for that.",
			part: "he went really miserable and furious for that",
			answer: "it left him miserable and furious",
			also: ["it left him furious and miserable"],
			why: { en: "Let the event be the subject: it did something to him.", "zh-CN": "让事件做主语：这件事让他怎样。" },
		},
		{
			id: "r2",
			kind: "collected",
			where: "r/WarriorCats",
			text: "For what it's worth, I always thought Bluestar knew more than she let on.",
			answer: "For what it's worth",
			cue: { en: "Offering your opinion without pushing it", "zh-CN": "表达看法但不强加于人" },
		},
		{
			id: "r3",
			kind: "own",
			where: "your email to a professor",
			text: "I want to ask if I can have one more week for the essay.",
			part: "I want to ask if I can have",
			answer: "Would it be possible to have",
			also: ["would it be possible to get", "could I possibly have"],
			why: { en: "A request opens politely with a question, not with what you want.", "zh-CN": "提请求用问句开头更礼貌，而不是先说“我想要”。" },
		},
		{
			id: "r4",
			kind: "own",
			where: "your AO3 comment",
			text: "This chapter made me very very sad, in a good way.",
			part: "made me very very sad",
			answer: "wrecked me",
			also: ["absolutely wrecked me", "destroyed me"],
			why: { en: "Fans say a chapter wrecked them: strong, casual, and a compliment.", "zh-CN": "粉丝会说一章 wrecked me：强烈、口语，而且是夸奖。" },
		},
	],
};
/** A card review asks (its front: lib/review/faces.ts), with why it is said this way for its back. */
export type ReviewCard = Face & { id: string; kind: "own" | "collected"; where: string; why?: string; phrase?: string };
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
/* ---------- Notebook entries the learner edited or deleted (/notebook/<id>), laid over what they came from ---------- */
export type NoteEdit = { phrase?: string; gloss?: string; deleted?: boolean };
export const NOTE_EDITS = "noteEdits";
export const noteEdits = () => read<Record<string, NoteEdit>>(NOTE_EDITS, {});
/** A collected phrase's id: stable across visits, from the reading it was kept in and the words kept. */
export function collectedId(c: Collected) {
	let h = 5381;
	for (const ch of `${c.batch ?? c.at}|${c.phrase}`) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
	return `c-${h.toString(36)}`;
}
/** Which stand-in note each stand-in card asks. */
export const CARD_NOTE: Record<string, string> = { r1: "n1", r2: "n4", r3: "n3", r4: "n2" };

export function reviewDeck(): ReviewCard[] {
	void app.version;
	const edits = noteEdits();
	const pick = (o: Local | string | undefined) => (typeof o === "string" ? o : (o?.[app.tutor] ?? o?.en ?? ""));
	const mine = collected()
		.filter((c) => c.lang === app.lang && c.sentence && c.marked && c.sentence.includes(c.marked))
		.map((c): ReviewCard => {
			const id = collectedId(c);
			return {
				id,
				kind: "collected",
				where: tx("nbSomethingRead"),
				text: c.sentence as string,
				answer: c.marked as string,
				cue: edits[id]?.gloss ?? c.meaning,
				phrase: edits[id]?.phrase ?? c.phrase,
			};
		});
	const stand = (sandboxed() ? [] : (DECK[app.lang] ?? [])).map((c): ReviewCard => {
		const e = edits[CARD_NOTE[c.id]];
		if (c.kind === "collected") return { ...c, cue: e?.gloss ?? pick(c.cue) };
		// An own card is their sentence as they settled it, the phrase blanked, cued by what they first wrote there; an
		// edited phrase is the answer from then on.
		const answer = e?.phrase ?? c.answer;
		return {
			id: c.id,
			kind: "own",
			where: c.where,
			text: c.text.replace(c.part, answer),
			answer,
			also: c.also,
			was: c.part,
			why: e?.gloss ?? pick(c.why),
		};
	});
	// A deleted entry leaves review too.
	return [...stand, ...mine].filter((c) => !edits[CARD_NOTE[c.id] ?? c.id]?.deleted);
}

/* ---------- The week: which days the learner practised ---------- */
/*
 * A day counts (its glass is poured) only when the learner both learned something (finished a piece, a scenario, a
 * translation, or wrote a piece again from memory) and cleared their reviews (finished a sitting, or had nothing due), as
 * the main app's streak rule: a completion and an empty queue on the same day. One of the two alone is a half day, its
 * glass turned upright and empty so the other half is one step away, never counted. Stand-in history for the days before today;
 * today is real on this device.
 */
export type DayKind = "full" | "learned" | "reviewed" | "none" | "later";
const PRACTICE = "practiceDays";
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
// Stored as "both", "learned" or "reviewed". Days kept before the rule changed said "full" (a piece finished) or
// "light" (only reviewed).
const kindOf = (k: string | undefined): DayKind | undefined =>
	k === "both" ? "full" : k === "learned" || k === "full" ? "learned" : k === "reviewed" || k === "light" ? "reviewed" : undefined;
/** Credits today with one half; returns whether that changed anything (and leaves a note for the shell to show it). */
export function practised(what: "learned" | "reviewed"): boolean {
	const all = read<Record<string, string>>(PRACTICE, {});
	const was = kindOf(all[dayKey()]) ?? "none";
	const learned = what === "learned" || was === "learned" || was === "full";
	// Nothing due means the reviews are as done as they can be.
	const reviewed = what === "reviewed" || was === "reviewed" || was === "full" || reviewDeck().length === 0;
	const kind: DayKind = learned && reviewed ? "full" : learned ? "learned" : "reviewed";
	if (kind === was) return false;
	all[dayKey()] = kind === "full" ? "both" : kind;
	write(PRACTICE, all);
	sessionStorage.setItem("weekEarned", kind);
	app.touch();
	return true;
}
export function weekDays(now = new Date()) {
	void app.version;
	const mon = (now.getDay() + 6) % 7;
	const all = read<Record<string, string>>(PRACTICE, {});
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(now);
		d.setDate(now.getDate() - mon + i);
		const real = kindOf(all[dayKey(d)]);
		const kind: DayKind = i > mon ? "later" : (real ?? (i === mon - 2 ? "full" : i === mon - 3 ? "learned" : i === mon - 1 ? "reviewed" : "none"));
		return { i, today: i === mon, kind };
	});
}
export const weekCount = () => weekDays().filter((d) => d.kind === "full").length;
/** The whole history, week by week (Monday first), for the profile: this week is real; the weeks before are a
    stand-in, drawn from a fixed seed so the page is the same on every visit. */
export function historyWeeks(weeks = 26, now = new Date()) {
	void app.version;
	const mon = (now.getDay() + 6) % 7;
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mon);
	let seed = 7;
	const rand = () => {
		seed = (seed * 16807) % 2147483647;
		return (seed - 1) / 2147483646;
	};
	const out: { start: Date; days: DayKind[] }[] = [];
	for (let w = weeks - 1; w >= 0; w--) {
		const s = new Date(start);
		s.setDate(start.getDate() - w * 7);
		// The learner started 19 weeks ago, and got steadier.
		const busy = w > 18 ? 0 : 0.3 + (18 - w) * 0.02;
		// Last week met the aim, so the run is alive while this one is under way.
		const days: DayKind[] =
			w === 0
				? weekDays(now).map((d) => d.kind)
				: w === 1
					? ["full", "reviewed", "full", "learned", "full", "none", "full"]
					: Array.from({ length: 7 }, () => (rand() < busy ? "full" : rand() < 0.25 && w <= 18 ? (rand() < 0.5 ? "learned" : "reviewed") : "none"));
		out.push({ start: s, days });
	}
	return out;
}
export const todayKind = () => weekDays().find((d) => d.today)?.kind ?? "none";

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
