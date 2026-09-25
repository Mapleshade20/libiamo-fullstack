import type { StreakEvent, StreakRecord } from "$lib/streak";
import type { StreakDayMark } from "$lib/streak-history";

/**
 * A development override for the navbar streak indicator, driven by `/streak-lab`.
 *
 * Production never sets any of this, and the lab route itself is `dev`-only, so the override stays
 * null in a build. Keeping it in one small module means `StreakIndicator` has a single `?? ` to
 * read rather than a scatter of dev branches.
 */
class StreakPreview {
	/** Overrides the layout's record when set. */
	record = $state<StreakRecord | null>(null);
	/** Overrides today's date when set, so day travel does not need the system clock. */
	today = $state<string | null>(null);
	/** Replays a transition without changing any state. The token makes repeats distinct. */
	replay = $state<{ event: StreakEvent; token: number } | null>(null);
	/** 1 is real time; the lab slows transitions down to inspect them. */
	speed = $state(1);
	/** Forces the reduced-motion branch on, whatever the device reports. */
	forceReducedMotion = $state(false);
	microMotion = $state<"auto" | "moving" | "static">("auto");
	/** Starts a new rehearsal without altering production acknowledgment receipts. */
	epoch = $state(0);
	days = $state<StreakDayMark[]>([]);
	since = $state<string | null>(null);

	set(record: StreakRecord | null, today: string | null = this.today) {
		this.record = record;
		this.today = today;
	}

	clear() {
		this.microMotion = "auto";
		this.epoch++;
		this.record = null;
		this.days = [];
		this.since = null;
		this.today = null;
		this.replay = null;
	}

	play(event: StreakEvent) {
		this.replay = { event, token: Date.now() };
	}
}

export const streakPreview = new StreakPreview();
