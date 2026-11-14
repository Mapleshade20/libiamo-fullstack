import { AgentReplyWorker } from "#lib/server/exchange/agents/worker.ts";
import { building } from "$app/env";

type BootRecord = { worker: AgentReplyWorker; bootTag: symbol };

declare global {
	var __agentReplyWorker: BootRecord | undefined;
}

/**
 * Unique per module evaluation. Vite dev re-executes this module after edits; import.meta.hot is not available in
 * SvelteKit's SSR runner, so the tag is how a fresh module instance recognizes (and replaces) a worker started by stale
 * code instead of leaving its loop running until a manual restart.
 */
const bootTag = Symbol("agent-reply-worker-boot");

/**
 * The agent reply worker runs inside the web server process: no separate worker deployment. Starts at most once per
 * module instance, replaces workers left over from invalidated dev modules, and stops with the server so in-flight
 * generations finish before the shared pool closes. Claim fencing makes the brief old/new overlap during replacement
 * safe.
 */
export function ensureAgentReplyWorker(): void {
	if (building) return;
	const existing = globalThis.__agentReplyWorker;
	if (existing?.bootTag === bootTag) return;
	if (existing) void existing.worker.stop();
	const worker = new AgentReplyWorker();
	worker.start();
	globalThis.__agentReplyWorker = { worker, bootTag };
}

/** Stops the worker, letting in-flight generations finish (shutdown). */
export async function stopAgentReplyWorker(): Promise<void> {
	await globalThis.__agentReplyWorker?.worker.stop();
}
