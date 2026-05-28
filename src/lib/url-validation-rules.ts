/**
 * SSRF-defense URL validation utilities shared by image-url.ts and server/byok-url.ts.
 */

export function normalizeHostname(hostname: string): string {
	let normalized = hostname.toLowerCase();
	if (normalized.startsWith("[") && normalized.endsWith("]")) {
		normalized = normalized.slice(1, -1);
	}
	return normalized;
}

export function isPrivateIpv4(address: string): boolean {
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

export function isPrivateIpv6(address: string): boolean {
	const normalized = address.toLowerCase();
	const mappedIpv4 = parseMappedIpv4(normalized);
	if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

	return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

export function parseMappedIpv4(address: string): string | null {
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

export function isHexWord(value: string): boolean {
	if (value.length < 1 || value.length > 4) return false;
	for (const char of value) {
		const code = char.charCodeAt(0);
		const isDigit = code >= 48 && code <= 57;
		const isLowerHex = code >= 97 && code <= 102;
		if (!isDigit && !isLowerHex) return false;
	}
	return true;
}

export function isIpAddress(hostname: string): boolean {
	const bare = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
	if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(bare)) return true;
	if (bare.includes(":")) return true;
	return false;
}

export function isBlockedAddress(address: string): boolean {
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

export function isBlockedHostname(hostname: string): boolean {
	const normalized = normalizeHostname(hostname);

	if (normalized === "localhost" || normalized === "localhost.localdomain") return true;
	if (normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;

	if (isIpAddress(normalized) && isBlockedAddress(normalized)) return true;

	return false;
}
