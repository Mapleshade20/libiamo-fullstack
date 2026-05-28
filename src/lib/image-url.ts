const MAX_IMAGE_URL_LENGTH = 2048;

function normalizeHostname(hostname: string): string {
	let normalized = hostname.toLowerCase();
	if (normalized.startsWith("[") && normalized.endsWith("]")) {
		normalized = normalized.slice(1, -1);
	}
	return normalized;
}

function isPrivateIpv4(address: string): boolean {
	const parts = address.split(".").map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

	const [a, b] = parts;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127) ||
		a >= 224
	);
}

function isPrivateIpv6(address: string): boolean {
	const normalized = address.toLowerCase();
	const mappedIpv4 = parseMappedIpv4(normalized);
	if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

	return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function parseMappedIpv4(address: string): string | null {
	const prefix = "::ffff:";
	if (!address.startsWith(prefix)) return null;
	const suffix = address.slice(prefix.length);

	const dottedParts = suffix.split(".");
	if (dottedParts.length === 4) {
		const numbers = dottedParts.map((part) => Number(part));
		if (numbers.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
			return numbers.join(".");
		}
		return null;
	}

	const hexParts = suffix.split(":");
	if (hexParts.length !== 2 || !hexParts.every(isHexWord)) return null;
	const high = Number.parseInt(hexParts[0], 16);
	const low = Number.parseInt(hexParts[1], 16);
	return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isHexWord(value: string): boolean {
	if (value.length < 1 || value.length > 4) return false;
	for (const char of value) {
		const code = char.charCodeAt(0);
		const isDigit = code >= 48 && code <= 57;
		const isLowerHex = code >= 97 && code <= 102;
		if (!isDigit && !isLowerHex) return false;
	}
	return true;
}

function isBlockedAddress(address: string): boolean {
	const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
	if (ipv4Match) {
		const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].map(Number);
		if (octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255)) {
			return isPrivateIpv4(octets.join("."));
		}
		return true;
	}

	const bare = address.startsWith("[") ? address.slice(1, -1) : address;
	if (bare.includes(":")) {
		return isPrivateIpv6(bare);
	}

	return true;
}

function isIpAddress(hostname: string): boolean {
	const bare = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
	if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(bare)) return true;
	if (bare.includes(":")) return true;
	return false;
}

function isBlockedHostname(hostname: string): boolean {
	const normalized = normalizeHostname(hostname);

	if (normalized === "localhost" || normalized === "localhost.localdomain") return true;
	if (normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;

	if (isIpAddress(normalized) && isBlockedAddress(normalized)) return true;

	return false;
}

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
