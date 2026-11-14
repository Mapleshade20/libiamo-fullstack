/* A learner's pieces as the pages see them: in their lists, and a finished one on its own page. */

/** A notebook entry's body, written when the piece is finished (server/revision/pass2 notesFor). */
export type NoteBody = { phrase: string; meaning: string; usage: string; examples: { t: string; n: string }[] };
/**
 * One thing the learner worked out: the phrase they settled on, and whether they found it themselves. text: the tutor's
 * pattern; before: what they first wrote there; final: what they settled on; was: for a pass-1 change, just the words it
 * replaced (before and final are then its whole sentence).
 */
export type Learned = { text: string; own: boolean; before?: string; final?: string; was?: string; note?: NoteBody };
export type Leftover = { quote: string; note: string };
export type Posted = "yes" | "not-yet" | "no";

/** A piece in the learner's lists (the sidebar, My writing, the shelf). */
export type PieceItem = {
	id: string;
	title: string;
	site: string;
	lang: string;
	at: number;
	open: boolean;
	scenarioId?: string;
	finishedAt?: number;
	/** What the notebook keeps from it, and since when its entries are on their way. */
	learned?: Learned[];
	notesPending?: number;
	posted?: Posted;
	askedAt?: number;
	again?: { text: string; at: number };
	state?: "posted" | "revised";
};

/** What a finished revision left, as the piece's page shows it. */
export type PieceResult = {
	original: string;
	final: string;
	/** The reader's reaction to the final version (none for a scenario or a translation). */
	closing: string;
	reader: string;
	/** Rebuilt parts first, then those given, then pass 1's; at most six. While the entries are being written
	 *  (`notesPending`), what pass 2 reworked stands in, and stays if that fails. */
	learned: Learned[];
	notesPending?: number;
	/** What the final check still flagged. */
	leftovers: Leftover[];
	/** A translation's text as it was first written, shown beside the learner's final version. */
	authentic?: string;
	finishedAt: number;
};

/** A piece's own page. */
export type PieceView = PieceItem & { result?: PieceResult };

/** Whether a piece's notebook entries are still on their way (a call takes seconds; after two minutes it is given up). */
export const notesPending = (r: { notesPending?: number } | undefined, now = Date.now()) => !!r?.notesPending && now - r.notesPending < 120_000;
