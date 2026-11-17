import { account } from "#lib/account/account.svelte.ts";
import { app } from "#lib/account/app.svelte.ts";
import { practised, recordTourPiece, sandboxed, tourPieces } from "#lib/components/tour/sandbox.svelte.ts";
import type { LEARNABLE } from "#lib/constants.ts";
import { tx } from "#lib/i18n/tx.ts";
import { learnerState } from "#lib/scope.ts";
import { clock, dateAt, daysAgo } from "#lib/time/clock.svelte.ts";
import { dueOf, pickFollowUp } from "./follow-up.ts";
import type { PieceItem, PiecesPage, Posted, Shelf } from "./types.ts";
import { answerPosted, piecesInPage, shelves, writeAgain } from "./writing.remote.ts";

/*
 * The learner's pieces: the server's shelf of each language (given to the root layout's load: the unfinished, the six
 * most recent, the follow-up, how many are finished; the same size however much they have written) poured into state the
 * sidebar and the home page read, asked for again after anything that changes it. My writing reads its own pages. One refresh at a time (an older
 * answer can overwrite a newer one, sveltejs/kit#17354); one asked for meanwhile runs once the first is in. While the
 * tour plays, its sandbox's pieces stand in, and what it does to them stays there.
 */
export const writing = learnerState(() => {
	const w = $state<{ shelves: Record<string, Shelf> }>({ shelves: {} });
	return w;
});

const EMPTY: Shelf = { open: [], recent: [], finished: 0 };

/** The tour's pieces in the language being worked in, newest first, as its own shelf. */
function tourShelf(): Shelf {
	const all = tourPieces()
		.filter((w) => w.lang === app.lang)
		.toSorted((x, y) => y.at - x.at);
	return {
		open: all.filter((w) => w.open),
		recent: all.filter((w) => w.phase !== "abandoned").slice(0, 6),
		finished: all.filter((w) => w.finishedAt).length,
		followUp: pickFollowUp(dueOf(all, clock.now)),
	};
}

/** What every page shows of the learner's pieces in the language being worked in (types.ts `Shelf`). */
export function shelfNow(): Shelf {
	return sandboxed() ? tourShelf() : (writing.shelves[app.lang] ?? EMPTY);
}

/** The shelf's follow-up: one card at most (lib/writing/follow-up.ts). */
export const followUp = () => shelfNow().followUp;

/** A page of My writing (the first without `after`); the tour's holds its pieces on one. */
export function piecesPageNow(after?: string): PiecesPage | Promise<PiecesPage> {
	if (sandboxed())
		return {
			items: tourPieces()
				.filter((w) => w.lang === app.lang)
				.toSorted((x, y) => y.at - x.at),
		};
	return piecesInPage({ lang: app.lang as (typeof LEARNABLE)[number], ...(after ? { after } : {}) });
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
			writing.shelves = await shelves()
				.refresh()
				.then(() => shelves());
		} while (again);
	})()
		.catch((e) => console.error("the shelf was not loaded", e))
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
export function whenOf(w: PieceItem): string {
	const days = daysAgo(w.at);
	return days === 0 ? tx("when_today") : days === 1 ? tx("when_yesterday") : dateAt(w.at, { month: "short", day: "numeric" });
}
