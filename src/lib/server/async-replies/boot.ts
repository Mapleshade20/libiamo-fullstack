import { building } from "$app/environment";
import { env } from "$env/dynamic/private";
import { AsyncReplyWorker } from "$lib/server/async-replies/worker";

type BootRecord = { worker: AsyncReplyWorker; bootTag: symbol };

declare global {
	var __asyncReplyWorker: BootRecord | undefined;
}

/**
 * Unique per module evaluation. Vite dev re-executes this module after edits;
 * import.meta.hot is NOT available in SvelteKit's SSR runner, so the tag is how
 * a fresh module instance recognizes (and replaces) a worker started by stale
 * code instead of leaving its loop running until a manual restart.
 */
const bootTag = Symbol("async-reply-worker-boot");

/**
 * The async reply executor runs inside the web server process: no separate
 * worker deployment. Starts at most once per module instance, replaces workers
 * left over from invalidated dev modules, and stops with the server so
 * in-flight generations finish before the shared pool closes. Claim fencing
 * makes the brief old/new overlap during replacement safe.
 */
export function ensureAsyncReplyWorker(): void {
	if (building) return;

	// A pre-tag boot shape stored the bare worker instance; tolerate it so a
	// dev server that upgrades mid-flight keeps serving instead of throwing.
	const existing = globalThis.__asyncReplyWorker as BootRecord | AsyncReplyWorker | undefined;
	const existingTag = existing && "bootTag" in existing ? existing.bootTag : undefined;
	if (existingTag === bootTag) return;
	if (existing) {
		const staleWorker = "worker" in existing ? existing.worker : existing;
		void staleWorker?.stop?.();
	}

	const worker = new AsyncReplyWorker({
		scanIntervalMs: Number(env.ASYNC_REPLY_WORKER_SCAN_MS ?? 1_000),
		leaseMs: Number(env.ASYNC_REPLY_WORKER_LEASE_MS ?? 30_000),
		concurrency: Number(env.ASYNC_REPLY_WORKER_CONCURRENCY ?? 2),
		retryBackoffMs: Number(env.ASYNC_REPLY_WORKER_RETRY_MS ?? 60_000),
	});
	worker.start();
	globalThis.__asyncReplyWorker = { worker, bootTag };
}
