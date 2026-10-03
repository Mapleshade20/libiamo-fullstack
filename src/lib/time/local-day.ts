/**
 * Local calendar days as plain `YYYY-MM-DD` strings.
 *
 * Every function takes an explicit time zone and an explicit instant; nothing here reads a clock or
 * module state, so the server, the client, and tests all agree about what day it is.
 */

const DAY_MS = 86_400_000;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const partFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string) {
	let formatter = dayFormatters.get(timeZone);
	if (!formatter) {
		// en-CA renders ISO-shaped dates, which is exactly the storage format.
		formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
		dayFormatters.set(timeZone, formatter);
	}
	return formatter;
}

function partFormatter(timeZone: string) {
	let formatter = partFormatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		partFormatters.set(timeZone, formatter);
	}
	return formatter;
}

/** How far the zone's wall clock is ahead of UTC at a given instant, in milliseconds. */
function zoneOffsetMs(at: number, timeZone: string): number {
	const parts = partFormatter(timeZone).formatToParts(new Date(at));
	const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");
	const wallClockAsUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
	return wallClockAsUtc - Math.floor(at / 1000) * 1000;
}

/** The learner's local calendar day at an instant, as `YYYY-MM-DD`. */
export function localDay(at: Date | number, timeZone: string): string {
	return dayFormatter(timeZone).format(typeof at === "number" ? new Date(at) : at);
}

/** Whole days from one local day to another; negative when `to` is earlier. */
export function dayDelta(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** A local day shifted by whole days. */
export function addDays(day: string, days: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The later of two local days. */
export function maxDay(a: string, b: string): string {
	return a >= b ? a : b;
}

/** The instant at which a local day begins. */
export function startOfLocalDay(day: string, timeZone: string): Date {
	const wallClock = Date.parse(`${day}T00:00:00Z`);
	// Solve for the instant whose wall clock is midnight. One refinement pass is enough: the first
	// guess can only be wrong when a DST shift falls between the two, and the second lands inside
	// the correct offset. On a day whose midnight does not exist the result is the first instant
	// after the jump, which is still the start of that day.
	const firstGuess = wallClock - zoneOffsetMs(wallClock, timeZone);
	return new Date(wallClock - zoneOffsetMs(firstGuess, timeZone));
}

/** The instant at which the learner's next local day begins — when a note created now becomes due. */
export function startOfNextLocalDay(at: Date | number, timeZone: string): Date {
	return startOfLocalDay(addDays(localDay(at, timeZone), 1), timeZone);
}
