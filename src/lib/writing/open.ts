import { goto } from "$app/navigation";
import type { Writing } from "./types.ts";

/** Where a piece opens, from any list of them (the sidebar, My writing): a finished one on its own page, an unfinished
 *  one back where it was: a scenario still being played in its place (a translation on its sheet), else its revision. */
export function openPiece(w: Writing) {
	if (w.finishedAt && !w.open) return goto(`/w/${w.id}`);
	return reopen(w);
}

export function reopen(w: Writing) {
	if (w.phase === "writing" && w.scenarioId) return goto(`/scenario/${w.scenarioId}/${w.site === "Translate" ? "translate" : "play"}`);
	return goto(`/live/${w.id}`);
}
