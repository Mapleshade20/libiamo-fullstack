import { addDays, dayDelta, localDay } from "./local-day.ts";

/*
 * Dates as a page shows them. Two kinds of value, never mixed: an instant (a time something happened, a `Date`, epoch
 * milliseconds or an ISO string) is shown in the learner's time zone; a day (`YYYY-MM-DD`, the server's name for a
 * learner's local day, an issue's date) is already local and is shown as it is, whatever zone the code runs in. Every
 * function takes the zone, so the server's page and the browser's agree (lib/time/clock.svelte.ts holds the zone).
 */

/** The moment a page was made and the learner's time zone (the root layout's load gives it to every page). */
export type Clock = { now: number; timeZone: string };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(lang: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
	const key = `${lang}|${timeZone}|${JSON.stringify(options)}`;
	let f = formatters.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat(lang, { ...options, timeZone });
		formatters.set(key, f);
	}
	return f;
}

const instant = (at: Date | number | string) => (at instanceof Date ? at : new Date(at));

/** An instant, in `timeZone`. */
export function formatInstant(at: Date | number | string, lang: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
	return formatter(lang, timeZone, options).format(instant(at));
}

/** A local day (`YYYY-MM-DD`), as the day it names. */
export function formatDay(day: string, lang: string, options: Intl.DateTimeFormatOptions): string {
	return formatter(lang, "UTC", options).format(new Date(`${day.slice(0, 10)}T00:00:00Z`));
}

/** The weekday of a local day, Monday first (0 is Monday). */
export function weekdayOf(day: string): number {
	return (new Date(`${day.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The names of the weekdays in `lang`, Monday first. */
export function weekdayNames(lang: string, style: "narrow" | "short" | "long"): string[] {
	// 2026-10-26 is a Monday.
	return Array.from({ length: 7 }, (_, i) => formatDay(addDays("2026-10-26", i), lang, { weekday: style }));
}

/** Whole local days from an instant to the clock's now: 0 the same day, 1 the day before. */
export function daysBefore(at: Date | number | string, clock: Clock): number {
	return dayDelta(localDay(instant(at), clock.timeZone), localDay(clock.now, clock.timeZone));
}
