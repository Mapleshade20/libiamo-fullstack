export function normalizeText(value: unknown, fallback: string) {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	return trimmed || fallback;
}

export function formatTime(date: Date, timeZone?: string) {
	const options: Intl.DateTimeFormatOptions = {
		hour: "2-digit",
		minute: "2-digit",
	};
	if (timeZone) options.timeZone = timeZone;

	try {
		return date.toLocaleTimeString([], options);
	} catch {
		const { timeZone: _timeZone, ...fallbackOptions } = options;
		return date.toLocaleTimeString([], fallbackOptions);
	}
}

export function getTodayDateString(language: string, timeZone?: string) {
	const options: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "long",
		day: "numeric",
	};
	if (timeZone) options.timeZone = timeZone;

	try {
		return new Intl.DateTimeFormat(language === "en" ? "en-US" : language, options).format(new Date());
	} catch {
		const { timeZone: _timeZone, ...fallbackOptions } = options;
		return new Intl.DateTimeFormat(language === "en" ? "en-US" : language, fallbackOptions).format(new Date());
	}
}
