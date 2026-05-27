import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { BYOK_BASE_URL_MAX_LENGTH } from "$lib/constants";

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export type ResolvedByokBaseUrl = {
	baseUrl: string;
	address: string;
	family: 4 | 6;
};

export class ByokBaseUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ByokBaseUrlError";
	}
}

function normalizeHostname(hostname: string) {
	let normalized = hostname.toLowerCase();
	if (normalized.startsWith("[") && normalized.endsWith("]")) {
		normalized = normalized.slice(1, -1);
	}
	return normalized;
}

function isPrivateIpv4(address: string) {
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

function isPrivateIpv6(address: string) {
	const normalized = address.toLowerCase();
	const mappedIpv4 = parseMappedIpv4(normalized);
	if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

	return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function parseMappedIpv4(address: string) {
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

function isHexWord(value: string) {
	if (value.length < 1 || value.length > 4) return false;
	for (const char of value) {
		const code = char.charCodeAt(0);
		const isDigit = code >= 48 && code <= 57;
		const isLowerHex = code >= 97 && code <= 102;
		if (!isDigit && !isLowerHex) return false;
	}
	return true;
}

function isBlockedAddress(address: string) {
	const family = net.isIP(address);
	if (family === 4) return isPrivateIpv4(address);
	if (family === 6) return isPrivateIpv6(address);
	return true;
}

function isBlockedHostname(hostname: string) {
	return BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local");
}

async function resolvePublicHostname(hostname: string): Promise<LookupAddress[]> {
	const ipFamily = net.isIP(hostname);
	if (ipFamily) {
		if (isBlockedAddress(hostname)) {
			throw new ByokBaseUrlError("Base URL must not point to a private or local address.");
		}
		return [{ address: hostname, family: ipFamily }];
	}

	if (isBlockedHostname(hostname)) {
		throw new ByokBaseUrlError("Base URL must not point to a private or local address.");
	}

	let addresses: LookupAddress[];
	try {
		addresses = await lookup(hostname, { all: true, verbatim: true });
	} catch {
		throw new ByokBaseUrlError("Base URL host could not be resolved.");
	}

	if (!Array.isArray(addresses) || addresses.length === 0) {
		throw new ByokBaseUrlError("Base URL host could not be resolved.");
	}

	if (addresses.some((entry) => isBlockedAddress(entry.address))) {
		throw new ByokBaseUrlError("Base URL must not resolve to a private or local address.");
	}

	return addresses;
}

export async function normalizeByokBaseUrl(baseUrl: string): Promise<string> {
	return (await resolveByokBaseUrl(baseUrl)).baseUrl;
}

export async function resolveByokBaseUrl(baseUrl: string): Promise<ResolvedByokBaseUrl> {
	const raw = baseUrl.trim();
	if (!raw) throw new ByokBaseUrlError("Base URL is required.");
	if (raw.length > BYOK_BASE_URL_MAX_LENGTH) {
		throw new ByokBaseUrlError(`Base URL must be at most ${BYOK_BASE_URL_MAX_LENGTH} characters.`);
	}

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new ByokBaseUrlError("Base URL must be a valid URL.");
	}

	if (url.protocol !== "https:") {
		throw new ByokBaseUrlError("Base URL must use HTTPS.");
	}

	if (url.username || url.password) {
		throw new ByokBaseUrlError("Base URL must not include credentials.");
	}

	if (url.search || url.hash) {
		throw new ByokBaseUrlError("Base URL must not include query parameters or fragments.");
	}

	if (!url.hostname) {
		throw new ByokBaseUrlError("Base URL must include a host.");
	}

	const hostname = normalizeHostname(url.hostname);
	const addresses = await resolvePublicHostname(hostname);

	while (url.pathname.endsWith("/")) {
		url.pathname = url.pathname.slice(0, -1);
	}
	if (!url.pathname) url.pathname = "";
	const normalized = url.toString();
	const normalizedBaseUrl = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
	const [address] = addresses;

	return {
		baseUrl: normalizedBaseUrl,
		address: address.address,
		family: address.family as 4 | 6,
	};
}
