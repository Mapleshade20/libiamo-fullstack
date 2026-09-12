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
 * Rejection message for a provider that has not verified the address it returned.
 *
 * The sign-up path cannot surface the `APIError` code this is thrown with:
 * `handleOAuthUserInfo` catches anything the `user.create.before` hook throws and
 * keeps only `e.message`, which Better Auth's callback then turns into the `error`
 * query parameter by replacing spaces with underscores. Deriving the parameter
 * from the message keeps the two from drifting apart — see
 * `socialAuthFailure` and the test that pins the round-trip.
 */
export const OAUTH_EMAIL_NOT_VERIFIED_MESSAGE = "The provider did not verify this email address.";

const OAUTH_EMAIL_NOT_VERIFIED_PARAM = OAUTH_EMAIL_NOT_VERIFIED_MESSAGE.split(" ").join("_").toLowerCase();

/**
 * Why a social sign-in or account link did not go through, reduced to the cases a
 * user can act on differently. Better Auth emits well over a dozen distinct codes;
 * anything the user cannot respond to becomes plain `error`, because a wall of
 * near-identical "something went wrong" strings in four languages helps nobody.
 *
 * - `cancelled` — they pressed cancel on the provider's consent screen.
 * - `account-exists` — implicit linking was refused because the Libiamo account
 *   that owns this address has not verified it. Sign in with the password first.
 * - `already-linked-elsewhere` — the provider account belongs to a different user.
 * - `provider-email-unverified` — the provider has not verified the address, so it
 *   is not proof of anything. Verify it with the provider, then retry.
 * - `stale-session` — Better Auth guards `/unlink-account` with a freshness check
 *   against `session.createdAt`, and session renewal only extends `expiresAt`, so
 *   any session older than `session.freshAge` is rejected until the user signs in
 *   again. Collapsing this into `error` produces a "please try again" that can
 *   never succeed.
 */
export type SocialAuthFailure = "cancelled" | "account-exists" | "already-linked-elsewhere" | "provider-email-unverified" | "stale-session" | "error";

/**
 * Classifies both sources of failure: the `error` query parameter Better Auth
 * redirects with after an OAuth callback, and the `code` on an `APIError` thrown
 * by a direct API call. The two use different casing for the same conditions, so
 * everything is compared lower-cased.
 */
export function socialAuthFailure(code: string | null | undefined): SocialAuthFailure | null {
	if (!code) return null;
	const normalizedCode = code.toLowerCase();
	if (["access_denied", "user_cancelled", "cancelled"].includes(normalizedCode)) return "cancelled";
	if (normalizedCode === "account_not_linked") return "account-exists";
	if (normalizedCode === "account_already_linked_to_different_user") return "already-linked-elsewhere";
	if (["unable_to_link_account", "linking_not_allowed", OAUTH_EMAIL_NOT_VERIFIED_PARAM].includes(normalizedCode)) {
		return "provider-email-unverified";
	}
	if (normalizedCode === "session_not_fresh") return "stale-session";
	return "error";
}

/** Outcome of a Profile login-method action: a success, or one of the failures above. */
export type AccountActionResult = "connected" | "disconnected" | SocialAuthFailure;

export function accountActionErrorResult(code: unknown): AccountActionResult {
	return socialAuthFailure(typeof code === "string" ? code : null) ?? "error";
}

/**
 * The same classification rendered for the signed-out pages. These stay in English
 * because there is no account yet to read a language preference from, and guessing
 * one from `Accept-Language` for four error strings is not worth the machinery.
 */
export function socialAuthErrorMessage(code: string | null): string | null {
	switch (socialAuthFailure(code)) {
		case null:
			return null;
		case "cancelled":
			return "Authentication was canceled. You can try again when you’re ready.";
		case "account-exists":
			return "An account already uses this email address. Sign in with your password, confirm your email, then connect Google or GitHub from your profile.";
		case "already-linked-elsewhere":
			return "That Google or GitHub account is already connected to a different Libiamo account.";
		case "provider-email-unverified":
			return "Google or GitHub has not verified this email address. Verify it with them, then try again.";
		default:
			return "Google or GitHub authentication could not be completed. Please try again.";
	}
}
