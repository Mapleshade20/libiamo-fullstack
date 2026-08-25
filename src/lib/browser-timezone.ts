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
