import { BROWSER_TIMEZONE_COOKIE, isValidTimeZone } from "$lib/browser-timezone";

export function getBrowserTimezone(cookies: { get(name: string): string | undefined }): string {
	const timezone = cookies.get(BROWSER_TIMEZONE_COOKIE);
	return isValidTimeZone(timezone) ? timezone : "UTC";
}
