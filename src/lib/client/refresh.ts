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
