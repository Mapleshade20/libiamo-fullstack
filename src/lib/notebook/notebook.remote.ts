import { z } from "zod";
import { LEARNABLE, VERDICTS } from "#lib/constants.ts";
import { learner } from "#lib/server/guard.ts";
import { deleteNotes, dueOf, editNote, noteOf, notesOf, queueOf, rateNote } from "#lib/server/notebook/notes.ts";
import { week } from "#lib/week/week.remote.ts";
import { command, query, requested } from "$app/server";
import { RATINGS } from "../review/types.ts";
import type { DueSummary, Note, ReviewCard } from "./types.ts";

/* The notebook and review, in a language the learner works in (the page says which: the one it speaks). */

const UUID = /^[0-9a-f-]{36}$/;
const noteId = z.string().regex(UUID);
const language = z.enum(LEARNABLE);

export const notebook = query(language, async (lang): Promise<Note[]> => notesOf(learner(), lang));

/** Any id a link may carry; one that is not an entry of theirs is simply none. */
export const noteById = query(z.string(), async (id): Promise<Note | null> => (UUID.test(id) ? noteOf(learner(), id) : null));

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
	z.object({ id: noteId, rating: z.enum(RATINGS), verdict: z.enum(VERDICTS).nullable(), seconds: z.number().int().min(0).max(86_400) }),
	async ({ id, rating, verdict, seconds }) => {
		const r = await rateNote(learner(), id, rating, verdict, seconds);
		if (r.cleared) await week().refresh();
		return { queue: r.queue, outcomes: r.outcomes };
	},
);
