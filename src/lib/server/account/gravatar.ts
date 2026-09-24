import crypto from "node:crypto";

/**
 * Gravatar prefers SHA-256 identifiers now, but the identicon a user without a
 * photo already sees is derived from the hash in the URL: switching would hand
 * every such account a different random avatar. MD5 still resolves, so both the
 * image and the existence check keep using it.
 */
function emailHash(email: string): string {
	return crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

export function gravatarAvatarUrl(email: string | null | undefined): string {
	return `https://gravatar.com/avatar/${emailHash(email ?? "")}?d=identicon&s=192`;
}

const LOOKUP_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { hasAvatar: boolean; expiresAt: number }>();

/**
 * Whether the address has a photo of its own, rather than the generated
 * identicon. `d=404` is Gravatar's documented probe: the image CDN answers 404
 * instead of falling back when nothing is registered, and avatar requests are
 * not rate limited.
 *
 * A failed lookup answers `true`, because that branch only claims the avatar
 * comes from Gravatar — which holds either way. Inviting someone who already
 * uploaded a photo to go add one is the wrong guess.
 */
export async function hasGravatarAvatar(email: string | null | undefined): Promise<boolean> {
	const hash = emailHash(email ?? "");
	const cached = cache.get(hash);
	if (cached && cached.expiresAt > Date.now()) return cached.hasAvatar;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
	try {
		const response = await fetch(`https://gravatar.com/avatar/${hash}?d=404`, {
			method: "HEAD",
			signal: controller.signal,
		});
		if (response.status !== 200 && response.status !== 404) return true;
		const hasAvatar = response.status === 200;
		cache.set(hash, { hasAvatar, expiresAt: Date.now() + CACHE_TTL_MS });
		return hasAvatar;
	} catch {
		return true;
	} finally {
		clearTimeout(timeout);
	}
}
