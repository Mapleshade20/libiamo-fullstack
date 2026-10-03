/**
 * Pages whose form actions the reverse proxy rate-limits one by one (see
 * `docs/design/2026-10-03-abuse-protection.md`). A proxy can tell their actions apart only
 * by the query (`POST /profile?/changeEmail`), and it parses queries differently from
 * SvelteKit: Caddy's `query` matcher skips a query it cannot parse (an unescaped `;`), while
 * SvelteKit still finds the action in it, and either may decode a key the other reads raw.
 */
export const RATE_LIMITED_ACTION_ROUTES = ["/(auth)/sign-in", "/(auth)/sign-up", "/(auth)/forgot-password", "/(app)/profile"] as const;

/**
 * Whether a request to one of those pages names its action the one way a proxy rule can
 * match: exactly `?/name`, nothing else in the query. A POST without an action key is the
 * default action, which the proxy matches by path alone, so its query does not matter.
 */
export function isCanonicalActionUrl(method: string, routeId: string | null, search: string): boolean {
	if (method !== "POST" || !(RATE_LIMITED_ACTION_ROUTES as readonly (string | null)[]).includes(routeId)) return true;
	// SvelteKit takes the first key starting with "/" as the action, after decoding.
	const namesAction = [...new URLSearchParams(search).keys()].some((key) => key.startsWith("/"));
	return !namesAction || /^\?\/[A-Za-z]+$/.test(search);
}
