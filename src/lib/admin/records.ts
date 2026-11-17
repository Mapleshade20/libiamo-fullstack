import { langName } from "#lib/constants.ts";
import { dateAt, dateOfDay } from "#lib/time/clock.svelte.ts";

/*
 * Session records as the admin pages show them (docs/design/2026-11-11-session-records.md): a piece's revision as a
 * list of sessions with signals, one session's steps and calls, the cases flagged on them. Built on the server
 * (server/admin/sessions.ts) from `piece`, `piece_step` and `llm_call`.
 */

/** What a session's record says without any model call: the learner pushing back, the system struggling. */
export type SignalKind = "kept" | "own" | "question" | "tries" | "answer" | "left" | "failed" | "lost" | "slow" | "cost";
export const SIGNALS: Record<SignalKind, { name: string; label: (n: number) => string; system: boolean }> = {
	kept: { name: "Kept as is", label: (n) => (n > 1 ? `Kept as is at ${n} stops` : "Kept a stop as is"), system: false },
	own: { name: "Said it themselves", label: (n) => (n > 1 ? `Said what they meant ${n} times` : "Said what they meant themselves"), system: false },
	question: { name: "Asked a question", label: (n) => (n > 1 ? `Asked ${n} questions` : "Asked a question"), system: false },
	tries: { name: "Failed tries", label: (n) => `${n} failed tries in a row`, system: false },
	answer: { name: "Took the tutor's version", label: () => "Took the tutor's version", system: false },
	left: { name: "Left early", label: () => "Left before the end", system: false },
	failed: { name: "A call failed", label: (n) => (n > 1 ? `${n} calls failed` : "A call failed"), system: true },
	lost: { name: "Lost a point", label: () => "The end check found a lost point", system: true },
	slow: { name: "Slow", label: (n) => `Waited ${n} s`, system: true },
	cost: { name: "Costly", label: () => "Cost far above the median", system: true },
};
export type Signal = { kind: SignalKind; n?: number };

export type SessionRow = {
	/** The piece's id. */
	id: string;
	learner: string;
	lang: string;
	native: string;
	kind: "own" | "scenario" | "translation";
	site: string;
	title: string;
	at: string;
	minutes: number;
	stops: number;
	calls: number;
	cost: number;
	finished: boolean;
	signals: Signal[];
	/** Its calls' words are kept (the learner helps improve Libiamo, and the calls are not past thirty days). */
	callsKept: boolean;
	sha: string;
	/** Open cases on it. */
	cases: number;
};

export type RecordedCall = {
	id: number;
	purpose: string;
	tag: string;
	model: string;
	effort: string;
	state: "done" | "repaired" | "failed" | "discarded";
	/** Seconds from the session's start. */
	at: number;
	ms: number;
	tokens: { input: number; output: number };
	cost: number;
	/** Empty when the words were not kept. */
	messages: { role: string; content: string }[];
	output: string;
	error?: string;
};

export type RecordedStep = {
	/** The step's place on the tape. */
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

export type SessionView = SessionRow & { reader: string; steps: RecordedStep[]; callRecords: RecordedCall[] };

export type CaseRow = {
	id: number;
	session: string;
	title: string;
	step: string;
	stepLabel: string;
	note: string;
	by: string;
	at: string;
	status: "open" | "fixed" | "wontfix";
	commit?: string;
};

/** A bare date (`YYYY-MM-DD`) is a day as it is; any other is an instant, shown in the admin's time zone. */
export const fmtDay = (iso: string) =>
	iso.length === 10 ? dateOfDay(iso, { day: "numeric", month: "short" }, "en-GB") : dateAt(iso, { day: "numeric", month: "short" }, "en-GB");
export const fmtWhen = (iso: string) => dateAt(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, "en-GB");
export const fmtCost = (usd: number) => `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}`;
export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Language names in English, as the admin pages are. */
export const langEn = (code: string) => langName(code, "en");
