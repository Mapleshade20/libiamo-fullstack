import { invalidateAll } from "$app/navigation";
import { BROWSER_TIMEZONE_COOKIE, BROWSER_TIMEZONE_COOKIE_MAX_AGE, isValidTimeZone } from "$lib/browser-timezone";

function getCookie(name: string): string | undefined {
	const prefix = `${name}=`;
	const entry = document.cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(prefix));
	if (!entry) return undefined;

	try {
		return decodeURIComponent(entry.slice(prefix.length));
	} catch {
		return undefined;
	}
}

export function detectBrowserTimeZone(): string {
	try {
		const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return isValidTimeZone(value) ? value : "UTC";
	} catch {
		return "UTC";
	}
}

export async function syncBrowserTimeZone(): Promise<void> {
	const timezone = detectBrowserTimeZone();
	if (getCookie(BROWSER_TIMEZONE_COOKIE) === timezone) return;

	// Cookie Store is not available in every supported browser.
	// biome-ignore lint/suspicious/noDocumentCookie: The browser timezone must be available to server loads.
	document.cookie = `${BROWSER_TIMEZONE_COOKIE}=${encodeURIComponent(timezone)}; path=/; max-age=${BROWSER_TIMEZONE_COOKIE_MAX_AGE}; samesite=lax`;
	await invalidateAll();
}
