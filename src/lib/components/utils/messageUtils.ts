import type { DisplayClock } from "$lib/display-clock";

export function normalizeText(value: unknown, fallback: string) {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	return trimmed || fallback;
}

export function formatTime(date: Date, timeZone = "UTC") {
	return date.toLocaleTimeString("en-US", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function createTimeFormatter(timeZone = "UTC") {
	return (date: Date) => formatTime(date, timeZone);
}

export function getTodayDateString(language: string, clock: DisplayClock) {
	return new Intl.DateTimeFormat(language === "en" ? "en-US" : language, {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: clock.timeZone,
	}).format(clock.now);
}
