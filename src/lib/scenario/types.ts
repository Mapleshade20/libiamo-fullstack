import type { Place, ScenarioKind } from "#lib/constants.ts";

/*
 * Scenarios as the pages see them. A page never receives a version whole: `server/scenario/view.ts` builds what it may
 * show (no person's notes, no "others", nothing of what followed in the real thread).
 */

/** What the scenario page draws of how it starts, in the place's look (a projection of the opening, or the source). */
export type Situation =
	| { kind: "ao3"; work: string; author: string; chapter: string; excerpt: string; note: string }
	| {
			kind: "reddit";
			sub: string;
			title: string;
			author: string;
			body: string;
			time?: string;
			comments: { author: string; body: string; depth?: number; time?: string }[];
	  }
	| { kind: "email"; from: string; to?: string; subject: string; body: string; time?: string }
	| { kind: "chat"; place: string; messages: { author: string; text: string; time?: string }[] }
	/** source: what the learner translates, in their own language; glossary: names and terms the source gives;
	 *  where / readers: where the translation will appear and who reads it. */
	| {
			kind: "translate";
			brief: string;
			source: string;
			sourceLang: string;
			glossary?: { term: string; shown: string; gloss: string }[];
			where?: string;
			readers?: string;
	  };

/** The place as the interface names it (its cover's colours and drawing follow the name). */
export const SITE_OF: Record<Place, string> = {
	ao3: "AO3",
	reddit: "Reddit",
	email: "Email",
	discord: "Discord",
	imessage: "iMessage",
	translation: "Translate",
};

/** What the learner has done with a scenario: nothing yet, a piece in progress, or a piece written. */
export type ScenarioProgress = "new" | "open" | "written";

/** A scenario as a card: in the library, an issue, the shelf. */
export type ScenarioCard = {
	id: string;
	kind: ScenarioKind;
	place: Place;
	site: string;
	minutes: number;
	title: string;
	line: string;
	state: ScenarioProgress;
	publishedAt: number;
};

/** A scenario's own page. */
export type ScenarioView = ScenarioCard & {
	/** What a newcomer would not know (the game, what happened before); most have none. */
	introduction?: string;
	/** The language the situation is written in: the one learnt, or a translation's source language. */
	situationLang: string;
	situation: Situation;
	/** An exchange's scene: who the learner is, who is there, what they want out of it. */
	scene?: { you: string; people: { name: string; who: string }[]; goals: string[] };
	/** The learner's unfinished piece of it, and the last one written. */
	openPiece?: string;
	writtenPiece?: string;
};

export type IssueCard = { id: string; date: string; title: string; line: string; tone: string; deep: string; scenarios: ScenarioCard[] };

/** The library: the current issue, the pool ranked for this learner, the back issues. */
export type Library = { issue?: IssueCard; pool: ScenarioCard[]; past: IssueCard[] };
