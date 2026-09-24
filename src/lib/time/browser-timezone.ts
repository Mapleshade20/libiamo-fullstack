export const BROWSER_TIMEZONE_COOKIE = "libiamo-browser-timezone";
export const BROWSER_TIMEZONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isValidTimeZone(value: string | undefined): value is string {
	if (!value) return false;

	try {
		new Intl.DateTimeFormat(undefined, { timeZone: value }).format();
		return true;
	} catch {
		return false;
	}
}

/** The learner's browser timezone as synced into a cookie by the client, or UTC. */
export function getBrowserTimezone(cookies: { get(name: string): string | undefined }): string {
	const timezone = cookies.get(BROWSER_TIMEZONE_COOKIE);
	return isValidTimeZone(timezone) ? timezone : "UTC";
}
