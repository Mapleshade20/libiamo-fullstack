import { account } from "#lib/account/account.svelte.ts";
import { sandboxed } from "#lib/demo/app.svelte.ts";
import { recordWriting } from "#lib/demo/data.ts";
import type { PieceItem, Posted } from "./types.ts";
import { answerPosted, pieces, writeAgain } from "./writing.remote.ts";

/*
 * The learner's pieces in the browser: the server's list poured into state the lists read (the sidebar, My writing,
 * the shelf), asked for again after anything that changes it. One refresh at a time (an older answer can overwrite a
 * newer one, sveltejs/kit#17354); one asked for meanwhile runs once the first is in. The tour keeps its pieces in its
 * sandbox, so what it does to them stays there.
 */
export const writing = $state<{ list: PieceItem[] }>({ list: [] });

let running: Promise<void> | null = null;
let again = false;
export function refreshWriting(): Promise<void> {
	if (!account.signedIn || !account.me.onboarded || sandboxed()) return Promise.resolve();
	if (running) {
		again = true;
		return running;
	}
	running = (async () => {
		do {
			again = false;
			writing.list = await pieces()
				.refresh()
				.then(() => pieces());
		} while (again);
	})()
		.catch((e) => console.error("the list of pieces was not loaded", e))
		.finally(() => {
			running = null;
		});
	return running;
}

/** Whether they posted it. */
export async function setPosted(id: string, posted: Posted) {
	if (sandboxed()) return recordWriting({ id, posted, state: posted === "yes" ? "posted" : "revised", askedAt: Date.now() });
	await answerPosted({ id, posted });
	await refreshWriting();
}

/** The piece written again from memory. */
export async function wroteAgain(id: string, text: string) {
	if (sandboxed()) return recordWriting({ id, again: { text, at: Date.now() } });
	await writeAgain({ id, text });
	await refreshWriting();
}
