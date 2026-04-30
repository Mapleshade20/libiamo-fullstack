export function normalizeText(value: unknown, fallback: string) {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	return trimmed || fallback;
}

export function formatTime(date: Date) {
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function getTodayDateString(language: string) {
	return new Intl.DateTimeFormat(language === "en" ? "en-US" : language, {
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(new Date());
}
