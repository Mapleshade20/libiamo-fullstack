import { URGENCY_PRESETS, type Urgency } from "$lib/constants";

/**
 * Delay before an already-engaged agent re-engages after an interrupt (stale
 * generation or a delivery cancelled by a newer user message). The agent is
 * mid-conversation, so this replaces the full MTTH sample instead of resetting it.
 */
export const RE_ENGAGE_DELAY_MS = 2_000;

/**
 * Samples the reply delay from an exponential distribution with the urgency's MTTH,
 * hard-capped at the preset's cap so the tail can never exceed a bounded worst case.
 * P(cap) = exp(-cap / MTTH).
 */
export function sampleReplyDelayMs(urgency: Urgency, random: () => number = Math.random): number {
	const preset = URGENCY_PRESETS[urgency];
	const u = random();
	const sample = -Math.log(1 - u);
	return Math.max(0, Math.floor(Math.min(preset.replyCapMs, sample * preset.replyMtthMs)));
}

export function getSessionExpiry(startedAt: Date, maxSessionAgeSeconds: number): Date {
	return new Date(startedAt.getTime() + maxSessionAgeSeconds * 1_000);
}

/**
 * Typing delay before a reply of this length is delivered: the wait scales with
 * the length of the message being typed, hard-capped so the tail stays bounded.
 */
export function getDeliveryDelayMs(content: string): number {
	const unicodeLength = [...content].length;
	return Math.min(20_000, Math.max(1_500, 600 + 50 * unicodeLength));
}
