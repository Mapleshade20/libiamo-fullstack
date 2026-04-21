import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);

export { dayjs };

/**
 * Get the Monday of the ISO week containing the given date.
 * Returns a Date object set to midnight (local time).
 */
export function getMondayOfWeek(d: Date): Date {
	return dayjs(d).isoWeekday(1).startOf("day").toDate();
}

/**
 * Given a YYYY-MM-DD date string, return the Monday of its ISO week as YYYY-MM-DD.
 * Uses UTC interpretation so the result is independent of server timezone.
 */
export function getMondayOfWeekForDate(dateStr: string): string {
	return dayjs.utc(dateStr, "YYYY-MM-DD").isoWeekday(1).format("YYYY-MM-DD");
}

/**
 * Parse an ISO week string (e.g. "2024-W20") and return the Monday of that week.
 */
export function getMondayFromWeekString(weekStr: string): Date {
	const [yearStr, weekPart] = weekStr.split("-W");
	const year = Number.parseInt(yearStr, 10);
	const week = Number.parseInt(weekPart, 10);
	return dayjs(`${year}-01-01`).isoWeek(week).isoWeekday(1).toDate();
}

/**
 * Format a Date as YYYY-MM-DD.
 */
export function toDateString(d: Date): string {
	return dayjs(d).format("YYYY-MM-DD");
}

/**
 * Get the current ISO week string (e.g. "2024-W20").
 */
export function getCurrentWeekString(): string {
	const now = dayjs();
	return `${now.isoWeekYear()}-W${String(now.isoWeek()).padStart(2, "0")}`;
}

/**
 * Get the local date string (YYYY-MM-DD) for a given timezone.
 * Falls back to UTC date on invalid timezone.
 */
export function getLocalDateString(tz: string): string {
	try {
		return dayjs().tz(tz).format("YYYY-MM-DD");
	} catch {
		return dayjs().format("YYYY-MM-DD");
	}
}

/**
 * Build a "safe" Date object anchored at 12:00 UTC from a YYYY-MM-DD string.
 * Prevents timezone-induced day shifts in downstream logic.
 */
export function toSafeUtcDate(dateStr: string): Date {
	const d = dayjs(dateStr, "YYYY-MM-DD");
	return new Date(Date.UTC(d.year(), d.month(), d.date(), 12, 0, 0));
}
