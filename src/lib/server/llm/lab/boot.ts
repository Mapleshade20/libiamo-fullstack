import { building } from "$app/environment";
import { env } from "$env/dynamic/private";
import { readPositiveIntEnv } from "$lib/server/practice/agent-replies/boot";
import { setLlmCallInterceptor } from "../run";
import { labInterceptor } from "./interceptor";
import { DEFAULT_LAB_CONCURRENCY, LabWorker } from "./worker";

type LabBootRecord = { worker: LabWorker; bootTag: symbol };

declare global {
	var __llmLabWorker: LabBootRecord | undefined;
}

/** Unique per module evaluation, so a dev re-evaluation replaces the worker started by stale code. */
const bootTag = Symbol("llm-lab-boot");

export function isLlmLabEnabled(): boolean {
	return env.LLM_LAB?.trim().toLowerCase() !== "off";
}

/**
 * Installs tracing/overrides and starts the Lab worker. `LLM_LAB=off` leaves every recipe running
 * exactly as declared, with no extra queries.
 */
export function ensureLlmLab(): void {
	if (building) return;
	if (!isLlmLabEnabled()) {
		setLlmCallInterceptor(null);
		return;
	}
	setLlmCallInterceptor(labInterceptor);

	const existing = globalThis.__llmLabWorker;
	if (existing?.bootTag === bootTag) return;
	if (existing) void existing.worker.stop();
	const worker = new LabWorker(readPositiveIntEnv("LLM_LAB_CONCURRENCY", env.LLM_LAB_CONCURRENCY, DEFAULT_LAB_CONCURRENCY));
	worker.start();
	globalThis.__llmLabWorker = { worker, bootTag };
}

/** Starts newly created run cells without waiting for the recovery scan. */
export function wakeLlmLabWorker(): void {
	globalThis.__llmLabWorker?.worker.wake();
}
