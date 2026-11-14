import { langName } from "#lib/constants.ts";
import { ANNOUNCEMENTS } from "./announcements";
import { ISSUES, SCENARIOS, type Scenario } from "./scenarios";

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

// ── Scenarios and issues ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a scenario's simulation needs beyond what learners see: how soon replies come, how long it may go on, each
 * person's notes, who else may turn up, and how the real conversation went on after the opening (cut from a capture;
 * the people draw on it, learners never see it).
 */
export type Urgency = "high" | "medium" | "low";
export const URGENCY: { value: Urgency; label: string }[] = [
	{ value: "high", label: "Soon · about 30 s" },
	{ value: "medium", label: "In a while · about 2 min" },
	{ value: "low", label: "Later · about 10 min" },
];
export type SimExtra = {
	urgency: Urgency;
	maxTurns: number | null;
	notes: Record<string, string>;
	others: string;
	followed: { author: string; text: string }[];
};
export const SIM_EXTRA: Record<string, SimExtra> = {
	"ao3-fic": {
		urgency: "low",
		maxTurns: 6,
		notes: {
			mossfur_writes: "Wrote the fic over two years; reads every comment and often answers with a question about the reader's take.",
			lichenpaw: "Has commented on every chapter; friendly, never argues with other readers.",
		},
		others: "Other readers of the fic, mostly long-time Warriors fans.",
		followed: [
			{ author: "fernwhisker", text: "THE MOONSTONE SCENE. I had to put my phone down for a minute." },
			{ author: "mossfur_writes", text: "@fernwhisker sorry not sorry 😭 thank you for being here since chapter one" },
			{ author: "duskpelt_reads", text: "I loved that she never says Oakheart's name in the last chapter. It hurt more that way." },
		],
	},
	"reddit-practice": {
		urgency: "medium",
		maxTurns: 8,
		notes: {
			"u/quietfern": "B2 Spanish learner who asked the question; wants routines, not apps.",
			"u/tallgrass_42": "Learned English through fandom comments; casual, a bit of a joker.",
		},
		others: "Regulars of r/languagelearning: some polyglots, some beginners; a moderator who removes app advertising.",
		followed: [],
	},
	"discord-ending": { urgency: "high", maxTurns: null, notes: {}, others: "Other book-club members who drop in and out.", followed: [] },
};
export const simExtra = (id: string): SimExtra =>
	structuredClone(SIM_EXTRA[id] ?? { urgency: "medium", maxTurns: null, notes: {}, others: "", followed: [] });

export type ScenarioStatus = "published" | "draft" | "notes";
const STATUS: Record<string, ScenarioStatus> = { "translate-crow": "notes", "email-club": "draft", "discord-roommate": "draft" };
export const scenarioStatus = (id: string): ScenarioStatus => STATUS[id] ?? "published";
/** Pieces written from each scenario (the main app counts finished sessions). */
export const written = (id: string) => [38, 51, 22, 17, 64, 9, 27, 14, 31, 12, 19, 8, 11, 6, 3][SCENARIOS.findIndex((s) => s.id === id) % 15] ?? 0;
/** The learning languages a scenario can be written in (a translation's: the language translated into). */
export const languagesOf = (s: Scenario) => (s.site === "Translate" ? ["en"] : Object.keys(s.situation));
export const adminScenarios = () => SCENARIOS;

/** A translation scenario's source for each learner language: made at publish time, checked, then confirmed here. */
export type SourceRow = { lang: string; state: "confirmed" | "checked" | "notes" | "none"; notes: string[]; text?: string };
export const SOURCES: Record<string, SourceRow[]> = {
	"translate-crow": [
		{ lang: "zh-CN", state: "confirmed", notes: [] },
		{
			lang: "ja",
			state: "notes",
			notes: [
				"“rewrites years of lore” became 設定を書き換えた (“rewrote the settings”): “years of” is gone.",
				"“like a teenage girl” is softened to 若い子みたい.",
			],
			text: "どこから話せばいいのか。クロウフェザーとトーニーペルトがカップルなんてありえない。前振りがまったくないし、二匹ともまったくキャラじゃない。",
		},
		{ lang: "es", state: "checked", notes: [] },
		{ lang: "fr", state: "none", notes: [] },
	],
	"translate-menu": [
		{ lang: "zh-CN", state: "confirmed", notes: [] },
		{ lang: "ja", state: "confirmed", notes: [] },
		{ lang: "es", state: "confirmed", notes: [] },
	],
};

export const adminIssues = () => [
	{
		id: "winter",
		date: "2026-12-01",
		title: { en: "Winter letters" },
		line: { en: "Cards, thank-yous and a cancelled trip." },
		tone: "#cdd8e3",
		deep: "#2d3c4c",
		scenarios: ["imessage-thanks", "email-landlord", "email-extension", "discord-ending"],
	},
	...ISSUES,
];
export const issueState = (date: string, now = new Date("2026-11-11")) =>
	new Date(date) > now ? "scheduled" : now.getTime() - new Date(date).getTime() < 30 * 864e5 ? "current" : "past";

// ── Inbox ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Suggestion = {
	id: number;
	by: string;
	place: string;
	lang: string;
	situation: string;
	purpose: string;
	mine?: string;
	at: string;
	status: "pending" | "live" | "unused";
	reason?: string;
	scenario?: string;
};
export const SUGGESTIONS: Suggestion[] = [
	{
		id: 41,
		by: "learner 31",
		place: "Discord",
		lang: "en",
		situation: "A Warriors server where people share fan art. Someone posted a drawing of Jayfeather and asked for honest feedback on the anatomy.",
		purpose: "Give feedback that is honest but kind, and say what I liked first.",
		mine: "your drawing is very good but the legs is a little strange maybe?",
		at: "2026-11-10",
		status: "pending",
	},
	{
		id: 40,
		by: "learner 12",
		place: "Email",
		lang: "en",
		situation: "My landlord said the heating will be fixed “soon”. It has been three weeks.",
		purpose: "Ask for a date without sounding angry.",
		at: "2026-11-09",
		status: "pending",
	},
	{
		id: 38,
		by: "learner 48",
		place: "Reddit",
		lang: "es",
		situation: "Un hilo en r/Spain sobre qué ver en Granada en un fin de semana.",
		purpose: "Recomendar sitios menos turísticos y explicar por qué.",
		at: "2026-11-07",
		status: "pending",
	},
	{
		id: 33,
		by: "learner 7",
		place: "iMessage",
		lang: "fr",
		situation: "Mon colocataire m'a demandé si je peux arroser ses plantes pendant ses vacances.",
		purpose: "Accepter, et demander combien d'eau.",
		at: "2026-10-30",
		status: "live",
		scenario: "imessage-thanks",
	},
	{
		id: 29,
		by: "learner 3",
		place: "other",
		lang: "ja",
		situation: "会社の飲み会の幹事をすることになった。",
		purpose: "参加者に日程の候補を送る。",
		at: "2026-10-22",
		status: "unused",
		reason: "Too close to an existing scenario (discord-movie).",
	},
];

export type Feedback = {
	id: number;
	by: string;
	kind: "idea" | "bug" | "other";
	text: string;
	page: string;
	browser: string;
	at: string;
	done: boolean;
};
export const FEEDBACK: Feedback[] = [
	{
		id: 19,
		by: "learner 31",
		kind: "bug",
		text: "In pass 2 the buttons said “对” and “B” but I couldn't see what B meant until I pressed it.",
		page: "/live",
		browser: "Safari 19 · iPhone",
		at: "2026-11-10",
		done: false,
	},
	{
		id: 18,
		by: "learner 12",
		kind: "idea",
		text: "Could the notebook show which piece a phrase came from?",
		page: "/notebook",
		browser: "Chrome 142 · macOS",
		at: "2026-11-08",
		done: false,
	},
	{
		id: 15,
		by: "learner 48",
		kind: "other",
		text: "The Spanish email session was really good, the reader reply felt like a real school director!",
		page: "/w/2610",
		browser: "Firefox 145 · Windows",
		at: "2026-11-05",
		done: true,
	},
];

// ── Announcements ──────────────────────────────────────────────────────────────────────────────────────────────────

export type AdminAnnouncement = {
	id: number;
	date: Date | null;
	until: string;
	title: Record<string, string>;
	body: Record<string, string>;
	read: number;
};
export const adminAnnouncements = (): AdminAnnouncement[] => [
	{
		id: 8,
		date: null as Date | null,
		until: "2026-12-15",
		title: { en: "Translate with a glossary", "zh-CN": "翻译时可以查词表了" },
		body: {
			en: "Names and terms in a translation now have their usual renderings beside the source.",
			"zh-CN": "翻译里的人名和术语，旁边会给出常用译法。",
		},
		read: 0,
	},
	...ANNOUNCEMENTS.map((a, i) => ({ ...a, until: i ? "2026-11-20" : "2026-11-30", read: [212, 340][i] ?? 90 })),
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
