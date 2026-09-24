import { getContext } from "svelte";

export interface DisplayClock {
	now: number;
	timeZone: string;
}

export const DISPLAY_CLOCK_CONTEXT = "display-clock";

// Standalone previews have no request context; keep their fallback deterministic too.
export function getDisplayClock(): () => DisplayClock {
	return getContext<(() => DisplayClock) | undefined>(DISPLAY_CLOCK_CONTEXT) ?? (() => ({ now: 0, timeZone: "UTC" }));
}

export function isDisplayDay(value: string, clock: DisplayClock): boolean {
	const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: clock.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
	return formatter.format(new Date(value)) === formatter.format(clock.now);
}
