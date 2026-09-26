import EmojiConvertor from "emoji-js";
import type { DisplayClock } from "$lib/time/display-clock";

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

const emojiConvertor = new EmojiConvertor();
emojiConvertor.replace_mode = "unified";
emojiConvertor.allow_native = true;

/** Renders `:shortcode:` emoji as native characters, as chat apps do. */
export function renderEmojiShortcodes(text: string): string {
	return text ? emojiConvertor.replace_colons(text) : "";
}
