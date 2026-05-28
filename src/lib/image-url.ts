import { isBlockedHostname } from "$lib/url-validation-rules";

const MAX_IMAGE_URL_LENGTH = 2048;

/**
 * Validates a user-supplied image URL, returning the normalized URL string
 * only if it passes all safety checks. Returns `null` otherwise.
 *
 * This is the runtime defense for icon URLs rendered as <img src> —
 * it prevents SSRF via private/loopback addresses and blocks non-HTTPS schemes.
 */
export function safeImageUrl(raw: string | undefined | null): string | null {
	if (!raw || typeof raw !== "string") return null;

	const trimmed = raw.trim();
	if (trimmed.length === 0 || trimmed.length > MAX_IMAGE_URL_LENGTH) return null;

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}

	if (url.protocol !== "https:") return null;
	if (url.username || url.password) return null;
	if (!url.hostname) return null;

	if (isBlockedHostname(url.hostname)) return null;

	return url.href;
}
