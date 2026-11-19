import { z } from "zod";
import { LEARNABLE, VERDICTS } from "#lib/constants.ts";
import { learner } from "#lib/server/guard.ts";
import {
	addReading,
	deleteNotes,
	dueOf,
	editNote,
	notebookGlance,
	notebookPage,
	noteOf,
	queueOf,
	rateNote,
	readingOf,
} from "#lib/server/notebook/notes.ts";
import { week } from "#lib/week/week.remote.ts";
import { command, query, requested } from "$app/server";
import { RATINGS } from "../review/types.ts";
import type { DueSummary, Note, NotebookGlance, NotebookPage, ReviewCard } from "./types.ts";

/* The notebook and review, in a language the learner works in (the page says which: the one it speaks). */

// Ids are UUIDs: anything else is no row, never a query the database refuses.
const noteId = z.guid();
const language = z.enum(LEARNABLE);

/** A page of the list (lib/server/notebook/notes.ts `notebookPage`): the first without `after`. */
export const notebook = query(
	z.object({ lang: language, from: z.enum(["all", "own", "collected"]), after: noteId.optional() }),
	async ({ lang, from, after }): Promise<NotebookPage> => notebookPage(learner(), lang, from, after),
);

/** How many entries there are and the latest phrases (the profile, a scenario's page). */
export const glance = query(language, async (lang): Promise<NotebookGlance> => notebookGlance(learner(), lang));

/** Any id a link may carry; one that is not an entry of theirs is simply none. */
export const noteById = query(z.string(), async (id): Promise<Note | null> => (noteId.safeParse(id).success ? noteOf(learner(), id) : null));

/** What the shell shows: how many cards are due, and the first two. */
export const due = query(language, async (lang): Promise<DueSummary> => dueOf(learner(), lang));

/** A review sitting's cards. */
export const reviewQueue = query(language, async (lang): Promise<ReviewCard[]> => queueOf(learner(), lang));

export const changeNote = command(
	z.object({ id: noteId, phrase: z.string().trim().min(1).max(120), gloss: z.string().trim().max(400) }),
	async ({ id, phrase, gloss }) => {
		await editNote(learner(), id, { phrase, gloss });
		// The page says which of its lists to send back changed (the entry, the notebook).
		await Promise.all([requested(noteById, 1).refreshAll(), requested(notebook, 1).refreshAll()]);
	},
);

export const removeNotes = command(z.array(noteId).max(50), async (ids) => {
	await deleteNotes(learner(), ids);
	await Promise.all([requested(notebook, 1).refreshAll(), requested(due, 1).refreshAll()]);
});

/** A rating. The page goes on without waiting; this says where the card is now, for one that stays in the sitting. */
export const rate = command(
	z.object({
		id: noteId,
		requestId: z.uuid(),
		rating: z.enum(RATINGS),
		verdict: z.enum(VERDICTS).nullable(),
		seconds: z.number().int().min(0).max(86_400),
	}),
	async ({ id, requestId, rating, verdict, seconds }) => {
		const r = await rateNote(learner(), id, rating, verdict, seconds, new Date(), requestId);
		if (r.cleared) await week().refresh();
		return { queue: r.queue, outcomes: r.outcomes };
	},
);

/** Something pasted to collect from: kept as a reading at once, so its page (/collect/<id>) can be opened again. */
export const startReading = command(z.object({ passage: z.string().trim().min(1).max(12_000), lang: language }), async ({ passage, lang }) =>
	addReading(learner().id, passage, lang),
);

/** A reading of theirs, to collect from. */
export const readingById = query(z.string(), async (id) => (noteId.safeParse(id).success ? readingOf(learner().id, id) : null));
