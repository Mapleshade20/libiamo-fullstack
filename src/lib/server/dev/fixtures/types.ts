import type { Draft } from "#lib/server/revision/draft.ts";

/* The lab's fixtures: drafts with the demo's hand-made answers, offered by the developer settings. They go with the
   developer panel. */

/** A spot the hand-written demo handles. `at` is a substring of the draft (the `nth` occurrence, default 0). */
export type GoldItem = {
	id: string;
	at: string;
	nth?: number;
	/** p1: fixable without intent (改对). p2: needs the learner's intent (改好). */
	route: "p1" | "p2";
	/** The demo's fix, for p1. */
	fix?: string;
	/** p1 items the demo leaves to the learner's taste. */
	optional?: boolean;
	why: string;
};

/** A pass-2 spot the demo builds. `at` is a substring of `pass1Text`; `readings` are the meanings it offers. */
export type GoldSpot = {
	id: string;
	/** Substring of `pass1Text` when the fixture has one, else of the draft. */
	at: string;
	mode: "one" | "ask" | "given";
	/** What the writer may mean, likeliest first (writer's language). */
	readings: string[];
	why: string;
	/** Natural rewrites from the hand-made demos, [key words] bracketed. */
	refs?: string[];
	/** The demo's problem type label, e.g. 名词化. */
	type?: string;
};

export type Fixture = {
	draft: Draft;
	gold: GoldItem[];
	/** The demo's text after pass 1, so pass-2 experiments start from a fixed input. */
	pass1Text?: string;
	/** The demo's argument map roles, in order; `missing` marks a step the draft leaves out. */
	map?: { role: string; missing?: boolean }[];
	spots: GoldSpot[];
	/** How the demo's reader first reads the post. */
	readBack?: string;
	/** What the writer actually meant, said in their language (the demo's 填入我当时的原意). */
	intent?: string;
	/** Where the gold came from and how sure it is. */
	provenance?: string;
};

export function goldRange(text: string, g: GoldItem): [number, number] {
	let from = -1;
	for (let i = 0; i <= (g.nth ?? 0); i++) {
		from = text.indexOf(g.at, from + 1);
		if (from < 0) throw new Error(`gold ${g.id}: "${g.at}" not in draft`);
	}
	return [from, from + g.at.length];
}
