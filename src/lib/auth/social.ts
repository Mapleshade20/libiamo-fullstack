/** The sign-in providers the pages know how to draw; a deployment offers those it has credentials for. */
export const SOCIAL_PROVIDERS = [
	{ id: "google", label: "Google" },
	{ id: "github", label: "GitHub" },
] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]["id"];

/**
 * Why a new account from a provider is refused when the provider has not verified the address. Better Auth keeps only
 * the message of what `user.create.before` throws and turns it into the callback's `error` parameter.
 */
export const OAUTH_EMAIL_NOT_VERIFIED = "The provider did not verify this email address.";

/**
 * The catalog key for an `error` a provider round trip came back with: cancelling says nothing, anything else gets one
 * message (the cases a learner could act on differently are rare enough not to need their own).
 */
export function socialFailureKey(code: string | null | undefined): string | null {
	if (!code) return null;
	return ["access_denied", "user_cancelled", "cancelled"].includes(code.toLowerCase()) ? null : "auSocialFailed";
}
