import { building } from "$app/environment";
import { env } from "$env/dynamic/private";
import { AsyncReplyWorker } from "$lib/server/async-replies/worker";

declare global {
	var __asyncReplyWorker: AsyncReplyWorker | undefined;
}

/**
 * The async reply executor runs inside the web server process: no separate
 * worker deployment. Starts at most once per process (vite dev module reloads
 * re-execute this module), and stops with the server so in-flight generations
 * finish before the shared pool closes.
 */
export function ensureAsyncReplyWorker(): void {
	if (building || globalThis.__asyncReplyWorker) return;

	const worker = new AsyncReplyWorker({
		scanIntervalMs: Number(env.ASYNC_REPLY_WORKER_SCAN_MS ?? 1_000),
		leaseMs: Number(env.ASYNC_REPLY_WORKER_LEASE_MS ?? 30_000),
		concurrency: Number(env.ASYNC_REPLY_WORKER_CONCURRENCY ?? 2),
		retryBackoffMs: Number(env.ASYNC_REPLY_WORKER_RETRY_MS ?? 60_000),
	});
	worker.start();
	globalThis.__asyncReplyWorker = worker;
}
