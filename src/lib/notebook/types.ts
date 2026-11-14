import type { Register } from "#lib/constants.ts";
import type { Face } from "#lib/review/faces.ts";
import type { QueueKind, RatingName } from "#lib/review/types.ts";

/* The notebook as the pages see it (server/notebook/notes.ts). */

export type Example = { t: string; n?: string; span?: string };

/** An entry in the list and on its own page. */
export type Note = {
	id: string;
	phrase: string;
	from: "own" | "collected";
	/** Where it came from: the piece's title (with its page), or empty for something read. */
	where: string;
	whereHref?: string;
	/** Asked now (in today's queue). */
	due: boolean;
	/** Days until it is next asked, when not due. */
	next?: number;
	gloss: string;
	register?: Register;
	/** How it is used (own entries), or what makes it worth taking (collected ones). */
	usage?: string;
	examples?: Example[];
	/** Own: what the learner first wrote there, and the sentence as they settled it. Collected: the sentence it was read
	    in, and the words highlighted. */
	before?: string;
	final?: string;
	sentence?: string;
	marked?: string;
	/** The card review asks next. */
	card?: Face;
};

/** What a rating would do: the label its button shows, and when the card comes back if it stays in the sitting. */
export type Outcome = { label: string; stays: boolean; inMs: number };
/** A card in a review sitting. */
export type ReviewCard = Face & {
	id: string;
	kind: "own" | "collected";
	where: string;
	why?: string;
	phrase: string;
	queue: QueueKind;
	outcomes: Record<RatingName, Outcome>;
	/** A learning card shown early: how long until it is due. */
	dueIn?: number;
};
/** What the shell shows of the reviews: how many are due, and the first two to recall. */
export type DueSummary = { count: number; first: { phrase: string; where: string }[] };
