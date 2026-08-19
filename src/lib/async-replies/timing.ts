import { URGENCY_PRESETS, type Urgency } from "$lib/constants";

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

export function getDeliveryDelayMs(previousContent: string): number {
	const unicodeLength = [...previousContent].length;
	return Math.min(20_000, Math.max(1_500, 600 + 50 * unicodeLength));
}
