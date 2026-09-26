/** Outstanding agent work due within this horizon keeps the client polling. */
export const AGENT_WORK_DUE_SOON_MS = 30_000;
/** Wake slightly after the due time so the worker has claimed the batch first. */
export const AGENT_WORK_WAKE_BUFFER_MS = 2_000;

export type AgentWorkPollingPlan = { kind: "interval" } | { kind: "wake"; delayMs: number } | { kind: "none" };

/**
 * How a client watches for outstanding agent work (a batch still composing or
 * pacing out its deliveries): poll continuously while a reply placeholder is up
 * or work falls due within the horizon, otherwise wake once when the next work
 * item is due — and stop when nothing is outstanding. The conversation and the
 * Hall's unread inbox share it, at their own polling intervals.
 */
export function planAgentWorkPolling(input: { hasPendingPlaceholder: boolean; agentWorkDueAt: Date | null; now: Date }): AgentWorkPollingPlan {
	const dueAt = input.agentWorkDueAt?.getTime() ?? null;
	if (input.hasPendingPlaceholder || (dueAt !== null && dueAt <= input.now.getTime() + AGENT_WORK_DUE_SOON_MS)) {
		return { kind: "interval" };
	}
	if (dueAt !== null) {
		return { kind: "wake", delayMs: Math.max(0, dueAt + AGENT_WORK_WAKE_BUFFER_MS - input.now.getTime()) };
	}
	return { kind: "none" };
}
