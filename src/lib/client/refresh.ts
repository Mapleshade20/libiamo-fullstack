import type { LoadEvent } from "@sveltejs/kit";
import { onMount, untrack } from "svelte";
import { app } from "#lib/account/app.svelte.ts";
import { sandboxed } from "#lib/components/tour/sandbox.svelte.ts";
import { browser } from "$app/env";

/** One refresh in flight, with at most one follow-up to observe writes made while it was running. */
export function queuedRefresh(run: () => Promise<unknown>) {
	let current: Promise<void> | null = null;
	let again = false;
	return (): Promise<void> => {
		if (current) {
			again = true;
			return current;
		}
		current = (async () => {
			do {
				again = false;
				await run();
			} while (again);
		})().finally(() => {
			current = null;
		});
		return current;
	};
}

const refreshes = new WeakMap<object, () => Promise<void>>();
export function refreshQuery(query: { refresh(): Promise<unknown> }) {
	let refresh = refreshes.get(query);
	if (!refresh) {
		refresh = queuedRefresh(() => query.refresh());
		refreshes.set(query, refresh);
	}
	return refresh();
}

let hydrated = false;
/** The first page has hydrated (the root layout's onMount): what a page opens on from now on may be an older answer. */
export function settled() {
	hydrated = true;
}

type Held = { ready: boolean; error?: unknown; refresh(): Promise<unknown> };
const isQuery = (q: unknown): q is Held => typeof q === "object" && q !== null && "ready" in q && typeof (q as Held).refresh === "function";

/** How long an answer a page opened on counts as just asked. */
const FRESH_MS = 5_000;
/** What the pages last opened on, held for the visit so a page comes back at once: the latest 32 pages. */
const kept = new Map<string, { queries: Held[]; at: number }>();

/**
 * A page's load (`+page.ts`): the queries the page opens on, asked for before it is shown, in the browser (the server
 * renders with its own). Kit runs it on the hover or touch before a click and waits for it before the navigation's
 * view transition, which freezes the screen until the new page is in: so the old page stays alive while the answers
 * cross the ocean, and the new one comes whole.
 *
 * What the browser does not hold is waited for. What it holds is shown at once and asked again once the page is up
 * (`refreshHeld` with what this returns), or, `fresh`, asked again first (a page that must open on the server's latest:
 * review's deck, a reading's marks). Kit keeps an answer only while something references it, and nothing refreshes it
 * when it changes elsewhere (an endpoint, the server after a revision, another device): the pages' last answers are
 * kept here, so a page comes back at once, and are asked again when it does.
 */
export function opening(open: (event: LoadEvent<Record<string, string>>) => unknown[] | Promise<unknown[]>, { fresh = false } = {}) {
	return async (event: LoadEvent<Record<string, string>>): Promise<{ opened: Held[] }> => {
		// The tour's pages read its sandbox, never live data.
		if (!browser || sandboxed()) return { opened: [] };
		await event.parent();
		const queries = (await open(event)).filter(isQuery);
		const key = `${app.lang} ${event.url.pathname}${event.url.search}`;
		const last = kept.get(key);
		const recent = !!last && Date.now() - last.at < FRESH_MS;
		kept.delete(key);
		kept.set(key, { queries, at: recent && last ? last.at : Date.now() });
		if (kept.size > 32) kept.delete(kept.keys().next().value as string);
		// The first page is the server's, rendered with its answers: nothing to wait for or ask again.
		if (!hydrated) return { opened: [] };
		// One whose last asking failed is asked again and waited for: Kit keeps a failure (a page awaiting the query meets
		// it again), and the query is kept here past the moment Kit would let it go.
		const missing = queries.filter((q) => !q.ready || q.error).map((q) => (q.error ? refreshQuery(q) : q));
		// Held answers this young are not asked again (a hover passing again, a quick trip back), unless the page must
		// open on the latest.
		const held = recent && !fresh ? [] : queries.filter((q) => q.ready && !q.error);
		// A failure is the page's to show, as its own await meets it.
		await Promise.all([...missing, ...(fresh ? held.map(refreshQuery) : [])].map((p) => Promise.resolve(p).catch(() => {})));
		return { opened: fresh ? [] : held };
	};
}

/**
 * Asks again for the held answers a page opened on (its load's `opened`), from an effect: once the page shows them, and
 * once (the tour remounts pages on its sandbox).
 */
export function refreshHeld(opened: Held[]) {
	if (!sandboxed()) untrack(() => opened.splice(0).forEach((q) => void refreshQuery(q).catch(() => {})));
}

/**
 * A component outside the pages opening on what the browser still holds shows it at once and asks again. Call it as
 * the script runs, with the queries it opens on (the tour's plain values are skipped); the first page has just been
 * rendered by the server.
 */
export function revalidate(...queries: unknown[]) {
	if (!hydrated) return;
	// Whether each was held is known now; it is asked again once the page is up, after it has shown what was held.
	const held = queries.filter((q): q is Held => isQuery(q) && q.ready);
	if (held.length) onMount(() => held.forEach((q) => void refreshQuery(q).catch(() => {})));
}
