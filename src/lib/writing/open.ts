import { scenarioHref } from "#lib/scenario/href.ts";
import { goto } from "$app/navigation";
import type { Writing } from "./types.ts";

/** Where a piece opens, from any list of them (the sidebar, My writing): a finished or abandoned one on its own page, an
 *  unfinished one back where it was: a scenario still being played in its place (a translation on its sheet), else its
 *  revision. */
export function openPiece(w: Writing) {
	if ((w.finishedAt && !w.open) || w.phase === "abandoned") return goto(`/w/${w.id}`);
	return reopen(w);
}

export function reopen(w: Writing) {
	if (w.phase === "writing" && w.scenarioId) return goto(scenarioHref(w.scenarioId, w.site === "Translate" ? "translate" : "play", w.lang));
	return goto(`/live/${w.id}`);
}
