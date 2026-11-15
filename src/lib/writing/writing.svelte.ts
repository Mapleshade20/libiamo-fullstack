import { account } from "#lib/account/account.svelte.ts";
import { app } from "#lib/account/app.svelte.ts";
import { practised, recordTourPiece, sandboxed, tourPieces } from "#lib/components/tour/sandbox.svelte.ts";
import { tx } from "#lib/i18n/tx.ts";
import { learnerState } from "#lib/scope.ts";
import type { PieceItem, Posted, Writing } from "./types.ts";
import { answerPosted, pieces, writeAgain } from "./writing.remote.ts";

/*
 * The learner's pieces: the server's list (given to the root layout's load) poured into state the lists read (the
 * sidebar, My writing, the shelf), asked for again after anything that changes it. One refresh at a time (an older
 * answer can overwrite a newer one, sveltejs/kit#17354); one asked for meanwhile runs once the first is in. While the
 * tour plays, its sandbox's pieces stand in, and what it does to them stays there.
 */
export const writing = learnerState(() => {
	const w = $state<{ list: PieceItem[] }>({ list: [] });
	return w;
});

/** The learner's pieces in the language being worked in, newest first. */
export function myWriting(): Writing[] {
	const all: Writing[] = sandboxed() ? tourPieces() : writing.list;
	return all.filter((w) => w.lang === app.lang).toSorted((x, y) => y.at - x.at);
}

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
	if (sandboxed()) return recordTourPiece({ id, posted, state: posted === "yes" ? "posted" : "revised", askedAt: Date.now() });
	await answerPosted({ id, posted });
	await refreshWriting();
}

/** The piece written again from memory. */
export async function wroteAgain(id: string, text: string) {
	if (sandboxed()) {
		recordTourPiece({ id, again: { text, at: Date.now() } });
		return practised("learned");
	}
	await writeAgain({ id, text });
	await refreshWriting();
}

/** When a piece was last touched, as a list says it: today, yesterday, or the date. */
export function whenOf(w: Writing): string {
	const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(w.at).setHours(0, 0, 0, 0)) / 864e5);
	return days === 0
		? tx("when_today")
		: days === 1
			? tx("when_yesterday")
			: new Intl.DateTimeFormat(app.lang, { month: "short", day: "numeric" }).format(w.at);
}

/* The shelf's second slot: one card at most, for one piece: first whether it was posted (a day after it was finished,
   not again for a day after "not yet"), then, three days on, writing it again from memory. */
export type FollowUp = { kind: "posted" | "again"; w: Writing };
export function followUp(now = Date.now()): FollowUp | undefined {
	const done = myWriting().filter((w) => w.finishedAt);
	// A scenario's piece was sent in the simulation already: nothing to ask about posting.
	const ask = done.find((w) => !w.scenarioId && (!w.posted || (w.posted === "not-yet" && now - (w.askedAt ?? 0) > 864e5)));
	if (ask && !(ask.posted === "not-yet")) return { kind: "posted", w: ask };
	const again = done.find((w) => !w.again && now - (w.finishedAt ?? now) >= 3 * 864e5 - 36e5);
	if (again) return { kind: "again", w: again };
	return ask ? { kind: "posted", w: ask } : undefined;
}
