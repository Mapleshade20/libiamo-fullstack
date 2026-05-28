import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { BYOK_BASE_URL_MAX_LENGTH } from "$lib/constants";
import { isBlockedAddress, isBlockedHostname, normalizeHostname } from "$lib/url-validation-rules";

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
