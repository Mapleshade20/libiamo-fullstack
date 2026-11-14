import type { Urgency } from "#lib/constants.ts";

/* How long what the learner sends in a place may be, and how quickly the others answer. */
export const TEXT_MAX = 10_000;
export const MAIL_TEXT_MAX = 50_000;
/** An exchange left alone this long is over. */
export const EXCHANGE_MAX_AGE_SECONDS = 48 * 60 * 60;

export type UrgencyPreset = {
	/** Mean of the exponential reply delay distribution (true MTTH). */
	replyMtthMs: number;
	/** Hard cap: a reply is force-delivered at this delay even if the sampled tail exceeds it. */
	replyCapMs: number;
	idleFollowUpDelayMs: number;
};
export const URGENCY_PRESETS: Record<Urgency, UrgencyPreset> = {
	high: { replyMtthMs: 30_000, replyCapMs: 60_000, idleFollowUpDelayMs: 60 * 60_000 },
	medium: { replyMtthMs: 2 * 60_000, replyCapMs: 8 * 60_000, idleFollowUpDelayMs: 12 * 60 * 60_000 },
	low: { replyMtthMs: 10 * 60_000, replyCapMs: 40 * 60_000, idleFollowUpDelayMs: 24 * 60 * 60_000 },
};
