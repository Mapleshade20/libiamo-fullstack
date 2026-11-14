import type { LEARNABLE } from "#lib/constants.ts";
import { app, sandboxed } from "#lib/demo/app.svelte.ts";
import { sandboxDeck } from "#lib/demo/data.ts";
import { sandboxNotebook } from "#lib/demo/notes.ts";
import { due, noteById, notebook, reviewQueue } from "./notebook.remote.ts";
import type { DueSummary, Note, ReviewCard } from "./types.ts";

/** The language the pages speak, which the notebook is read in. */
export const lang = () => app.lang as (typeof LEARNABLE)[number];

/*
 * The notebook and review as the pages read them: the learner's own from the server, or the tour's from its sandbox
 * while it plays. Call these where the page reads them (a derived, the template), so the queries follow.
 */
export function dueNow(): DueSummary | Promise<DueSummary> {
	void app.version;
	if (!sandboxed()) return due(lang());
	const d = sandboxDeck();
	return { count: d.length, first: d.slice(0, 2).map((c) => ({ phrase: c.phrase, where: c.where })) };
}
export function notesNow(): Note[] | Promise<Note[]> {
	void app.version;
	return sandboxed() ? sandboxNotebook() : notebook(lang());
}
export function noteNow(id: string): Note | null | Promise<Note | null> {
	void app.version;
	return sandboxed() ? (sandboxNotebook().find((n) => n.id === id) ?? null) : noteById(id);
}
export function deckNow(): ReviewCard[] | Promise<ReviewCard[]> {
	void app.version;
	return sandboxed() ? sandboxDeck() : reviewQueue(lang());
}
