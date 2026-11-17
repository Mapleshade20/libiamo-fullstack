/* What the session's server steps send back (rehearsal-lab src/session/live.ts), as far as the page reads it. */

/** What a revision's page opens with: the server's answer to `POST /api/s` and to `resume` (server/revision/handover.ts). */
export type Setup = {
	text: string;
	background?: string;
	source?: string;
	detail?: "needed" | "more";
	learner: string;
	feedback: "native" | "target";
	lang?: string;
	scenario?: { id: string; title: string; site: string };
	/** A scenario's conversation as it happened; `text` is then its learner turns joined by `SEP` lines. */
	exchange?: Exchange;
	/** A translation scenario: the source the learner translated and the names and terms given (never the original). */
	translation?: {
		source: string;
		glossary: { term: string; shown: string; gloss: string }[];
		context: string;
		where?: string;
		readers?: string;
		target: string;
	};
};

/** What a page sends to start a revision: the learner's own draft, or one of their pieces the server holds whole (a
 *  translation's sheet, a scenario's conversation). */
export type Start = { learner: string; feedback: Setup["feedback"]; detail?: Setup["detail"] } & (
	| { text: string; background?: string; source?: string; lang?: string }
	| { pieceId: string }
);

/** The line between two of the learner's turns in a scenario's text (rehearsal-lab src/scenario/exchange.ts). */
export const SEP = "* * *";
export type ExMsg = { id: string; author: string; text: string; replyTo?: string | null; learner?: boolean };
export type Exchange = {
	place: "reddit" | "discord" | "ao3" | "mail" | "imessage";
	lang: string;
	scene: { platform: string; where: string; you: string; goals: string[]; cast: { name: string; who: string }[] };
	before: ExMsg[];
	transcript: ExMsg[];
};
/** How a scenario's turn landed (the session's "how it went"). */
export type Landed = {
	t: number;
	ok: boolean;
	cause: "wording" | "content" | "reader" | "none";
	why: string;
	by: string | null;
	reply: string | null;
	mine?: string;
};

export type Scene = {
	title?: string;
	site?: string;
	platform: string;
	audience: string;
	purpose: string;
	target: string;
	ui: string;
	reader?: string;
	community?: string;
};

/** A piece of the post: plain text, a marked item, or words the learner's own pass-1 answer carries in. */
export type Atom = string | { hole: string } | { choice: string[] } | { carry: string; text: string };
export type Seg = string | { carry: string; text: string } | { item: string; parts: Atom[]; revised?: boolean };
export type DocDef = Seg[][];

export type P1Stop = {
	item: string;
	/** quiet: a mechanical change typed in without a card. defer: marked for pass 2; only the first one has a note. */
	kind: "choice" | "fix" | "replace" | "link" | "group" | "defer" | "tick" | "quiet";
	prompt?: string;
	note?: string;
	wrongNote?: string;
	answer?: number;
	initial?: string;
	to?: string;
	answers?: Record<string, { ok: boolean; note: string }>;
	parts?: { item: string; ins: string }[];
	label?: string;
};

/** A pass-1 card as the learner answered it: the page's bookmark keeps them, so coming back fills them in. */
export type P1Answer = { picked?: number; keep?: boolean; to?: string; ok?: boolean | null; self?: boolean };

export type Reading = { label: string; meaning: string };
/** given: nothing to ask (a translation's source, or a spot about how something is put). */
export type Part = { problem: string; question?: string; mode: "one" | "ask" | "given"; readings: Reading[] };
/** who: in a scenario, the person the spot's turn was said to, and their real reply when the spot is why it went off. */
export type Spot = { id: string; label: string; parts: Part[]; who?: { turn: number; name: string | null; line: string | null } | null };

export type MapRow = { depth?: number; kind?: string; what: string; st?: "fix" | "miss"; note?: string; hl: string[]; ghost?: string };

export type Why = { label: string; note: string; free?: boolean };
export type Choice = { n: number; mine?: string; note?: string; verdict?: string };
export type Extra = { ref: string; mine: string; note: string; ok?: boolean };

export type Material = {
	doc?: DocDef;
	/** What the learner first wrote for this stretch, before pass 1. */
	orig?: string | null;
	reader: string;
	ref: string;
	alts?: string[];
	pieces: { text: string; own: boolean }[];
	construct: string;
	why: Why[];
	prompt: string;
	success: string;
};

export type Grade = { pass: boolean; ticks: number[]; choices?: Choice[]; extra?: Extra[]; reader?: string; tutor: string; repaired?: string };

/** A spot's material as the conversation uses it, with what grading has said about the learner's sentence. */
export type Explained = {
	ref: string;
	alts: string[];
	hints: { text: string; own: boolean }[];
	why: Why[];
	construct: string;
	prompt: string;
	success: string;
	ticks: number[];
	choices: Choice[];
	extra: Extra[];
};

/** How a spot ended, for the piece's page. */
/** tries/hinted: how much help it took. orig: what the learner first wrote there, before pass 1; before: as pass 2 found it. */
export type SpotResult = {
	kept?: boolean;
	text?: string;
	self?: boolean;
	gave?: boolean;
	skipped?: boolean;
	construct?: string;
	before?: string;
	orig?: string;
	tries?: number;
	hinted?: boolean;
};
