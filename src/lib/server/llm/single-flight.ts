const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `work` once per `key` at a time: a request that arrives while it is running (a reload, a
 * second tab, a retry after the proxy gave up waiting) shares its outcome instead of paying for
 * another LLM call. Let `work` read state and persist its result, so a request arriving after it
 * finished sees the result instead of generating again. The map is process-local, like the
 * deployment; the domain writes keep their own guards for anything that slips past it.
 */
export function singleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
	const running = inFlight.get(key) as Promise<T> | undefined;
	if (running) return running;
	const started = work().finally(() => inFlight.delete(key));
	inFlight.set(key, started);
	return started;
}
