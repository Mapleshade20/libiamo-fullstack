import { onMount } from "svelte";

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

type Revalidated = { ready: boolean; refresh(): Promise<unknown> };
const isQuery = (q: unknown): q is Revalidated =>
	typeof q === "object" && q !== null && "ready" in q && typeof (q as Revalidated).refresh === "function";

/**
 * A page opening on what the browser still holds shows it at once and asks again. Kit keeps a query's answer as long as
 * something references it (released by garbage collection, so for an unknown time), and a change made elsewhere never
 * refreshes it: an endpoint (/api/s, collecting), the server after a revision (the notebook's entries), another tab or
 * device. Call it as the page's script runs, with the queries it opens on (the tour's plain values are skipped); one not
 * in the browser yet is being asked for anyway, and the first page has just been rendered by the server.
 */
export function revalidate(...queries: unknown[]) {
	if (!hydrated) return;
	// Whether each was held is known now; it is asked again once the page is up, after it has shown what was held.
	const held = queries.filter((q): q is Revalidated => isQuery(q) && q.ready);
	if (held.length) onMount(() => held.forEach((q) => void refreshQuery(q).catch(() => {})));
}
