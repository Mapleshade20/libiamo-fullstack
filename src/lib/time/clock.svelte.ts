import { app } from "#lib/account/app.svelte.ts";
import { learnerState } from "#lib/scope.ts";
import { type Clock, daysBefore, formatDay, formatInstant } from "./format.ts";
import { localDay } from "./local-day.ts";

/*
 * The page's clock: the moment the server made the page and the learner's time zone (the root layout's load), so what
 * the server renders and what the browser hydrates read the same day. Once the page runs, the browser moves `now` on
 * every minute, so a page left open past midnight turns the day. Every date a page shows goes through here; nothing
 * reads `new Date()` for a day or formats without the zone (lib/time/format.ts says which kind of value is which).
 */
export const clock = learnerState(() => {
	const c = $state<Clock>({ now: 0, timeZone: "UTC" });
	return c;
});

/** Takes the server's clock (the root layout's load, on the server and in the browser). */
export function keepClock(c: Clock) {
	clock.now = c.now;
	clock.timeZone = c.timeZone;
}

/** Moves the clock on in the browser, from the next whole minute; returns the stop. */
export function runClock(): () => void {
	let every: ReturnType<typeof setInterval> | undefined;
	const tick = () => {
		clock.now = Date.now();
	};
	const first = setTimeout(
		() => {
			tick();
			every = setInterval(tick, 60_000);
		},
		60_000 - (Date.now() % 60_000),
	);
	return () => {
		clearTimeout(first);
		clearInterval(every);
	};
}

/** The learner's today, `YYYY-MM-DD`. */
export const today = () => localDay(clock.now, clock.timeZone);

/** An instant (when something happened) in the learner's time zone, in the language the page speaks. */
export const dateAt = (at: Date | number | string, options: Intl.DateTimeFormatOptions, lang: string = app.lang) =>
	formatInstant(at, lang, clock.timeZone, options);

/** A local day (`YYYY-MM-DD`), in the language the page speaks. */
export const dateOfDay = (day: string, options: Intl.DateTimeFormatOptions, lang: string = app.lang) => formatDay(day, lang, options);

/** Whole local days since an instant: 0 today, 1 yesterday. */
export const daysAgo = (at: Date | number | string) => daysBefore(at, clock);
