import { goto } from "$app/navigation";
import { demoOpens } from "./app.svelte";
import { HANDOFF_KEY, type Writing } from "./data";

/** Where a piece opens, from any list of them (the sidebar, My writing): a finished one on its own page, an unfinished
 *  one back in its session. */
export function openPiece(w: Writing) {
	if (w.result && !w.open) return goto(`/w/${w.id}`);
	reopen(w);
}

/** Back into an unfinished piece. The demo cannot pick a session up where it stopped (the server forgets on restart), so
 *  it starts it again from the same handoff; its calls come from the cache. */
export function reopen(w: Writing | undefined) {
	// A scenario set aside before its revision began: a translation back to its sheet (the draft is kept there), any other
	// back to how the thread ended (the stand-in has no handoff), where the revision starts.
	if (!w?.handoff && w?.scenarioId) return goto(`/scenario/${w.scenarioId}/${w.site === "Translate" ? "translate" : "after"}`);
	if (!w?.handoff) return demoOpens();
	// The new session works on the same piece, so it is not listed twice.
	sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ ...w.handoff, pieceId: w.id }));
	goto("/live");
}
