import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export class ByokBaseUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ByokBaseUrlError";
	}
}

function normalizeHostname(hostname: string) {
	return hostname.replace(/^\[|\]$/g, "").toLowerCase();
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
	let mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
	const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
	if (!mappedIpv4 && mappedHex) {
		const high = Number.parseInt(mappedHex[1], 16);
		const low = Number.parseInt(mappedHex[2], 16);
		mappedIpv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
	}
	if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

	return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
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

async function assertPublicHostname(hostname: string) {
	const ipFamily = net.isIP(hostname);
	if (ipFamily) {
		if (isBlockedAddress(hostname)) {
			throw new ByokBaseUrlError("Base URL must not point to a private or local address.");
		}
		return;
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
}

export async function normalizeByokBaseUrl(baseUrl: string): Promise<string> {
	const raw = baseUrl.trim();
	if (!raw) throw new ByokBaseUrlError("Base URL is required.");

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

	await assertPublicHostname(normalizeHostname(url.hostname));

	url.pathname = url.pathname.replace(/\/+$/, "");
	if (!url.pathname) url.pathname = "";
	return url.toString().replace(/\/$/, "");
}
