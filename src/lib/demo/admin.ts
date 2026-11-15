import { langName } from "#lib/constants.ts";

/*
 * Stand-ins for the admin pages (docs/design/2026-11-11-session-records.md in the main app). Nothing here is stored or
 * sent: the pages show how admin work looks once the main app's tables are behind them.
 */

// ── Sessions and cases ─────────────────────────────────────────────────────────────────────────────────────────────

/** What a session's record says without any model call: the learner pushing back, the system struggling. */
export type SignalKind = "kept" | "own" | "question" | "tries" | "answer" | "left" | "failed" | "lost" | "slow" | "cost";
export const SIGNALS: Record<SignalKind, { name: string; label: (n: number) => string; system: boolean }> = {
	kept: { name: "Kept as is", label: (n) => (n > 1 ? `Kept as is at ${n} stops` : "Kept a stop as is"), system: false },
	own: { name: "Said it themselves", label: (n) => (n > 1 ? `Said what they meant ${n} times` : "Said what they meant themselves"), system: false },
	question: { name: "Asked a question", label: (n) => (n > 1 ? `Asked ${n} questions` : "Asked a question"), system: false },
	tries: { name: "Failed tries", label: (n) => `${n} failed tries in a row`, system: false },
	answer: { name: "Asked for the answer", label: () => "Asked for the answer", system: false },
	left: { name: "Left early", label: () => "Left before the end", system: false },
	failed: { name: "A call failed", label: (n) => (n > 1 ? `${n} calls failed` : "A call failed"), system: true },
	lost: { name: "Lost a point", label: () => "The end check found a lost point", system: true },
	slow: { name: "Slow", label: (n) => `Waited ${n} s`, system: true },
	cost: { name: "Costly", label: () => "Cost far above the median", system: true },
};
export type Signal = { kind: SignalKind; n?: number };

export type SessionRow = {
	id: number;
	learner: string;
	lang: string;
	native: string;
	kind: "free" | "scenario" | "translation";
	site: string;
	title: string;
	at: string;
	minutes: number;
	stops: number;
	calls: number;
	cost: number;
	finished: boolean;
	signals: Signal[];
	/** Calls are kept 30 days unless the session is flagged. */
	callsKept: boolean;
	sha: string;
};

export const SESSIONS: SessionRow[] = [
	{
		id: 2611,
		learner: "Maple",
		lang: "en",
		native: "zh-CN",
		kind: "free",
		site: "Reddit",
		title: "Ask r/WarriorCats about StarClan's silence at the Moonstone",
		at: "2026-11-10T10:02",
		minutes: 16,
		stops: 4,
		calls: 22,
		cost: 0.041,
		finished: false,
		signals: [{ kind: "slow", n: 32 }, { kind: "left" }],
		callsKept: true,
		sha: "17ef9e3",
	},
	{
		id: 2610,
		learner: "learner 48",
		lang: "es",
		native: "en",
		kind: "free",
		site: "Email",
		title: "Pregunta sobre el alojamiento en Granada",
		at: "2026-11-10T08:51",
		minutes: 22,
		stops: 5,
		calls: 26,
		cost: 0.038,
		finished: true,
		signals: [{ kind: "lost" }, { kind: "own", n: 2 }],
		callsKept: true,
		sha: "17ef9e3",
	},
	{
		id: 2607,
		learner: "learner 12",
		lang: "en",
		native: "ja",
		kind: "scenario",
		site: "AO3",
		title: "Comment on a fic you loved",
		at: "2026-11-09T21:14",
		minutes: 11,
		stops: 2,
		calls: 18,
		cost: 0.022,
		finished: true,
		signals: [],
		callsKept: true,
		sha: "a724b24",
	},
	{
		id: 2603,
		learner: "learner 31",
		lang: "en",
		native: "zh-CN",
		kind: "translation",
		site: "Translate",
		title: "Translate a fan's rant about Crow & Tawny",
		at: "2026-11-09T18:40",
		minutes: 27,
		stops: 3,
		calls: 21,
		cost: 0.034,
		finished: true,
		signals: [{ kind: "tries", n: 4 }, { kind: "answer" }],
		callsKept: true,
		sha: "a724b24",
	},
	{
		id: 2598,
		learner: "learner 48",
		lang: "es",
		native: "en",
		kind: "scenario",
		site: "Email",
		title: "Pide una semana más",
		at: "2026-11-09T09:02",
		minutes: 9,
		stops: 2,
		calls: 17,
		cost: 0.019,
		finished: true,
		signals: [{ kind: "kept" }],
		callsKept: true,
		sha: "31d20a0",
	},
	{
		id: 2594,
		learner: "learner 7",
		lang: "fr",
		native: "de",
		kind: "free",
		site: "Discord",
		title: "Réponse au club de lecture",
		at: "2026-11-08T20:33",
		minutes: 14,
		stops: 3,
		calls: 24,
		cost: 0.083,
		finished: true,
		signals: [{ kind: "cost" }, { kind: "failed" }],
		callsKept: true,
		sha: "31d20a0",
	},
	{
		id: 2590,
		learner: "learner 12",
		lang: "en",
		native: "ja",
		kind: "free",
		site: "AO3",
		title: "Long Way Home, chapter 24",
		at: "2026-11-08T13:05",
		minutes: 8,
		stops: 1,
		calls: 15,
		cost: 0.016,
		finished: true,
		signals: [],
		callsKept: true,
		sha: "6d797c7",
	},
	{
		id: 2584,
		learner: "learner 31",
		lang: "en",
		native: "zh-CN",
		kind: "scenario",
		site: "Reddit",
		title: "Answer a question in r/languagelearning",
		at: "2026-11-07T22:47",
		minutes: 19,
		stops: 4,
		calls: 25,
		cost: 0.029,
		finished: true,
		signals: [
			{ kind: "question", n: 2 },
			{ kind: "kept", n: 2 },
		],
		callsKept: true,
		sha: "6d797c7",
	},
	{
		id: 2571,
		learner: "learner 3",
		lang: "ja",
		native: "en",
		kind: "free",
		site: "iMessage",
		title: "週末の予定",
		at: "2026-11-06T11:20",
		minutes: 6,
		stops: 1,
		calls: 14,
		cost: 0.012,
		finished: true,
		signals: [{ kind: "slow", n: 11 }],
		callsKept: true,
		sha: "bfa2aef",
	},
	{
		id: 2402,
		learner: "learner 48",
		lang: "es",
		native: "en",
		kind: "free",
		site: "Email",
		title: "Carta a la casera",
		at: "2026-10-09T17:58",
		minutes: 15,
		stops: 3,
		calls: 0,
		cost: 0.027,
		finished: true,
		signals: [{ kind: "own" }],
		callsKept: false,
		sha: "4c1e0aa",
	},
];
export const sessionById = (id: number) => SESSIONS.find((s) => s.id === id);

export type RecordedCall = {
	id: number;
	purpose: string;
	tag: string;
	model: string;
	effort: string;
	state: "done" | "cached" | "failed" | "discarded";
	/** Seconds from the session's start. */
	at: number;
	ms: number;
	tokens: { input: number; output: number };
	cost: number;
	messages: { role: string; content: string }[];
	output: string;
};
export type RecordedStep = {
	id: string;
	at: number;
	label: string;
	/** What the learner saw: the tutor, the reader, themselves, a card (pass 1's, the scene) or the buttons offered. */
	lines: { who: "me" | "tutor" | "reader" | "card" | "choices"; text: string }[];
	calls: number[];
	/** Seconds the learner waited for this step. */
	wait?: number;
	signals?: SignalKind[];
	flag?: { note: string; by: string; at: string; case: number };
};

export type CaseRow = {
	id: number;
	session: number;
	step: string;
	stepLabel: string;
	note: string;
	by: string;
	at: string;
	status: "open" | "fixed" | "wontfix";
	commit?: string;
};
export const CASES: CaseRow[] = [
	{
		id: 3,
		session: 2611,
		step: "t9",
		stepLabel: "Stop 2",
		note: "The pills read “对 | B”: nothing says what B is. The “and” problem is a false flag that skipped the judge because it overlapped “hard / not worth it”.",
		by: "Maple",
		at: "2026-11-10",
		status: "fixed",
		commit: "53ede84",
	},
	{
		id: 5,
		session: 2610,
		step: "t14",
		stepLabel: "Stop 4",
		note: "The reference dropped “¿Es el piso cerca de la escuela?” after the learner chose a host family.",
		by: "Maple",
		at: "2026-11-10",
		status: "open",
	},
	{
		id: 6,
		session: 2603,
		step: "t11",
		stepLabel: "Stop 2 · try 4",
		note: "Four tries graded as missing “ridiculous” when the learner wrote “absurd”. The grader keeps the source's word too literally.",
		by: "Maple",
		at: "2026-11-09",
		status: "open",
	},
	{
		id: 2,
		session: 2584,
		step: "t8",
		stepLabel: "Stop 2",
		note: "Asked about “stealing phrases” twice; the answer repeated the reference instead of explaining.",
		by: "Maple",
		at: "2026-11-08",
		status: "fixed",
		commit: "a724b24",
	},
	{
		id: 1,
		session: 2594,
		step: "t5",
		stepLabel: "Pass 2 analysis",
		note: "The analysis call timed out once and the retry cost three times the median.",
		by: "Maple",
		at: "2026-11-08",
		status: "wontfix",
	},
];

// ── Shared ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A bare date is a day, not UTC midnight (which shows as the day before west of Greenwich). */
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00` : iso);
export const fmtDay = (iso: string) => day(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const fmtCost = (usd: number) => `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}`;
export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Language names in English, as the admin pages are. */
export const langEn = (code: string) => langName(code, "en");
