import { building } from "$app/environment";
import { env } from "$env/dynamic/private";
import { AgentReplyWorker } from "$lib/server/agent-replies/worker";

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
		scanIntervalMs: Number(env.AGENT_REPLY_WORKER_SCAN_MS ?? env.ASYNC_REPLY_WORKER_SCAN_MS ?? 1_000),
		leaseMs: Number(env.AGENT_REPLY_WORKER_LEASE_MS ?? env.ASYNC_REPLY_WORKER_LEASE_MS ?? 30_000),
		concurrency: Number(env.AGENT_REPLY_WORKER_CONCURRENCY ?? env.ASYNC_REPLY_WORKER_CONCURRENCY ?? 2),
		retryBackoffMs: Number(env.AGENT_REPLY_WORKER_RETRY_MS ?? env.ASYNC_REPLY_WORKER_RETRY_MS ?? 60_000),
	});
	worker.start();
	globalThis.__agentReplyWorker = { worker, bootTag };
	globalThis.__asyncReplyWorker = undefined;
}
