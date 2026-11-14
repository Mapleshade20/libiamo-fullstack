import { startPiece } from "#lib/session/start.ts";
import type { Setup } from "#lib/session/types.ts";
import { goto } from "$app/navigation";
import { demoOpens, toast, tx } from "./app.svelte";
import type { Writing } from "./data";

/** Where a piece opens, from any list of them (the sidebar, My writing): a finished one on its own page, an unfinished
 *  one back in its revision. */
export function openPiece(w: Writing) {
	if (w.finishedAt && !w.open) return goto(`/w/${w.id}`);
	reopen(w);
}

const PIECE = /^[0-9a-f-]{36}$/;

/** Back into an unfinished piece: its revision comes back to where it was. */
export async function reopen(w: Writing | undefined) {
	// A scenario's piece still being played goes back to its place.
	if (w?.phase === "writing" && w.scenarioId) return goto(`/scenario/${w.scenarioId}/${w.site === "Translate" ? "translate" : "play"}`);
	if (w && PIECE.test(w.id)) return goto(`/live/${w.id}`);
	// A scenario set aside before its revision began: a translation back to its sheet (the draft is kept there), any other
	// back to how the thread ended (the stand-in has no handoff), where the revision starts.
	if (!w?.handoff && w?.scenarioId) return goto(`/scenario/${w.scenarioId}/${w.site === "Translate" ? "translate" : "after"}`);
	if (!w?.handoff) return demoOpens();
	const id = await startPiece(w.handoff as unknown as Setup).catch(() => null);
	if (!id) return toast(tx("startFailed"));
	goto(`/live/${id}`);
}
