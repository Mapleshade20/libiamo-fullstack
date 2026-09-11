export const SOCIAL_PROVIDERS = [
	{ id: "google", label: "Google" },
	{ id: "github", label: "GitHub" },
] as const;

export const SOCIAL_PROVIDER_IDS = SOCIAL_PROVIDERS.map(({ id }) => id);
export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]["id"];

export function isSocialProviderId(value: unknown): value is SocialProviderId {
	return typeof value === "string" && SOCIAL_PROVIDER_IDS.some((provider) => provider === value);
}

/**
 * Outcome of a Profile login-method action, shared by the server actions, the
 * page load (for OAuth callbacks that come back as a query parameter) and the
 * notification the page renders.
 *
 * `stale-session` is kept separate from `error` because it is the one failure a
 * user can act on: Better Auth guards `/unlink-account` with a freshness check
 * against `session.createdAt`, and session renewal only extends `expiresAt`, so
 * any session older than `session.freshAge` is rejected until the user signs in
 * again. Collapsing it into `error` produces a "please try again" that can never
 * succeed.
 */
export type AccountActionResult = "connected" | "disconnected" | "error" | "stale-session";

export function accountActionErrorResult(code: unknown): AccountActionResult {
	return code === "SESSION_NOT_FRESH" ? "stale-session" : "error";
}

export function socialAuthErrorMessage(code: string | null): string | null {
	if (!code) return null;
	const normalizedCode = code.toLowerCase();
	if (["access_denied", "user_cancelled", "cancelled"].includes(normalizedCode)) {
		return "Authentication was canceled. You can try again when you’re ready.";
	}
	if (normalizedCode === "signup_disabled") {
		return "To create a new Libiamo account, choose Sign Up below and select a learning language.";
	}
	return "Google or GitHub authentication could not be completed. Please try again.";
}
