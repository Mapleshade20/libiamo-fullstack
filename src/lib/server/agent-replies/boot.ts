import { building } from "$app/environment";
import { env } from "$env/dynamic/private";
import {
	AgentReplyWorker,
	DEFAULT_WORKER_CONCURRENCY,
	DEFAULT_WORKER_LEASE_MS,
	DEFAULT_WORKER_RETRY_BACKOFF_MS,
	DEFAULT_WORKER_SCAN_INTERVAL_MS,
} from "$lib/server/agent-replies/worker";

type BootRecord = { worker: AgentReplyWorker; bootTag: symbol };

declare global {
	var __agentReplyWorker: BootRecord | undefined;
	/** Temporary HMR bridge for workers started before the agent-replies rename. */
	var __asyncReplyWorker: BootRecord | AgentReplyWorker | undefined;
}

/**
 * Unique per module evaluation. Vite dev re-executes this module after edits;
 * import.meta.hot is NOT available in SvelteKit's SSR runner, so the tag is how
 * a fresh module instance recognizes (and replaces) a worker started by stale
 * code instead of leaving its loop running until a manual restart.
 */
const bootTag = Symbol("agent-reply-worker-boot");

/**
 * A misconfigured tuning value must never silently disable the worker: a bare
 * `Number()` turns an empty or non-numeric variable into 0/NaN, and a zero
 * concurrency stops every reply from ever being claimed while a NaN scan
 * interval degrades `setInterval` into a busy loop. Anything that is not a
 * positive integer falls back to the default and says so in the log.
 */
export function readPositiveIntEnv(name: string, raw: string | undefined, fallback: number): number {
	if (raw === undefined || raw.trim() === "") return fallback;
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		console.warn(`Ignoring ${name}=${JSON.stringify(raw)}: expected a positive integer, using ${fallback} instead.`);
		return fallback;
	}
	return parsed;
}

/**
 * The agent reply executor runs inside the web server process: no separate
 * worker deployment. Starts at most once per module instance, replaces workers
 * left over from invalidated dev modules, and stops with the server so
 * in-flight generations finish before the shared pool closes. Claim fencing
 * makes the brief old/new overlap during replacement safe.
 */
export function ensureAgentReplyWorker(): void {
	if (building) return;

	// A pre-tag boot shape stored the bare worker instance; tolerate it so a
	// dev server that upgrades mid-flight keeps serving instead of throwing.
	const existing = globalThis.__agentReplyWorker ?? globalThis.__asyncReplyWorker;
	const existingTag = existing && "bootTag" in existing ? existing.bootTag : undefined;
	if (existingTag === bootTag) return;
	if (existing) {
		const staleWorker = "worker" in existing ? existing.worker : existing;
		void staleWorker?.stop?.();
	}

	const worker = new AgentReplyWorker({
		// Keep the old environment names as fallbacks for deployed configurations
		// while the worker's code-facing domain name settles on agent-replies.
		scanIntervalMs: readPositiveIntEnv(
			"AGENT_REPLY_WORKER_SCAN_MS",
			env.AGENT_REPLY_WORKER_SCAN_MS ?? env.ASYNC_REPLY_WORKER_SCAN_MS,
			DEFAULT_WORKER_SCAN_INTERVAL_MS,
		),
		leaseMs: readPositiveIntEnv(
			"AGENT_REPLY_WORKER_LEASE_MS",
			env.AGENT_REPLY_WORKER_LEASE_MS ?? env.ASYNC_REPLY_WORKER_LEASE_MS,
			DEFAULT_WORKER_LEASE_MS,
		),
		concurrency: readPositiveIntEnv(
			"AGENT_REPLY_WORKER_CONCURRENCY",
			env.AGENT_REPLY_WORKER_CONCURRENCY ?? env.ASYNC_REPLY_WORKER_CONCURRENCY,
			DEFAULT_WORKER_CONCURRENCY,
		),
		retryBackoffMs: readPositiveIntEnv(
			"AGENT_REPLY_WORKER_RETRY_MS",
			env.AGENT_REPLY_WORKER_RETRY_MS ?? env.ASYNC_REPLY_WORKER_RETRY_MS,
			DEFAULT_WORKER_RETRY_BACKOFF_MS,
		),
	});
	worker.start();
	globalThis.__agentReplyWorker = { worker, bootTag };
	globalThis.__asyncReplyWorker = undefined;
}
