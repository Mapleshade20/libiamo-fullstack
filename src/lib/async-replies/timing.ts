import { URGENCY_PRESETS, type Urgency } from "$lib/constants";

export function sampleReplyDelayMs(urgency: Urgency, random: () => number = Math.random): number {
	const preset = URGENCY_PRESETS[urgency];
	const sample = Math.min(1, Math.max(0, random()));
	return Math.floor(preset.replyDelayMinMs + sample * (preset.replyDelayMaxMs - preset.replyDelayMinMs));
}

export function getSessionExpiry(startedAt: Date, maxSessionAgeSeconds: number): Date {
	return new Date(startedAt.getTime() + maxSessionAgeSeconds * 1_000);
}

export function getDeliveryDelayMs(previousContent: string): number {
	const unicodeLength = [...previousContent].length;
	return Math.min(20_000, Math.max(1_500, 600 + 50 * unicodeLength));
}
