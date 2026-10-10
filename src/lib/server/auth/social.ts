import type { BetterAuthOptions } from "better-auth";
import { APIError, getOAuthState } from "better-auth/api";
import { OAUTH_EMAIL_NOT_VERIFIED_MESSAGE, SOCIAL_PROVIDER_IDS, type SocialProviderId } from "$lib/auth/social";
import { LANGUAGE_CODES, type LanguageCode } from "$lib/constants";
import { disabledLanguages } from "$lib/server/env";

type Environment = Record<string, string | undefined>;
type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

/**
 * What a sign-in that turns out to be a sign-up starts learning. Only the sign-up
 * page asks for a language up front; coming from sign-in there is nothing to carry
 * in the OAuth state, and rejecting those users rather than picking a default would
 * make "Continue with Google" fail for exactly the people it is meant to serve.
 * They can change it with the Hall language switcher.
 */
const DEFAULT_ACTIVE_LANGUAGE: LanguageCode = "en";

function credentials(env: Environment, provider: SocialProviderId) {
	const clientId = env[`${provider.toUpperCase()}_CLIENT_ID`]?.trim();
	const clientSecret = env[`${provider.toUpperCase()}_CLIENT_SECRET`]?.trim();
	return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function oauthActiveLanguage(state: Record<string, unknown>, disabled: readonly LanguageCode[]) {
	const activeLanguage = state.activeLanguage;
	if (activeLanguage === undefined) return LANGUAGE_CODES.find((code) => !disabled.includes(code)) ?? DEFAULT_ACTIVE_LANGUAGE;
	if (typeof activeLanguage === "string" && LANGUAGE_CODES.includes(activeLanguage as LanguageCode)) return activeLanguage;
	// Present but not a language we offer: the state was tampered with, not absent.
	throw new APIError("BAD_REQUEST", {
		code: "INVALID_ACTIVE_LANGUAGE",
		message: "Choose a supported learning language.",
	});
}

export async function mapOAuthProfileToUser(disabled: readonly LanguageCode[] = []) {
	const state = await getOAuthState();
	// Mapping also runs for existing accounts, which must remain able to sign in.
	return state ? { activeLanguage: oauthActiveLanguage(state, disabled) } : {};
}

export function configuredSocialProviders(env: Environment): SocialProviders {
	const providers: SocialProviders = {};
	const google = credentials(env, "google");
	const github = credentials(env, "github");
	const mapProfileToUser = () => mapOAuthProfileToUser(disabledLanguages(env.DISABLED_LANGUAGES));

	// No `disableImplicitSignUp`: an unrecognised identity arriving at Sign In is
	// signed up on the spot rather than bounced to Sign Up to repeat the round-trip.
	if (google) providers.google = { ...google, mapProfileToUser };
	if (github) providers.github = { ...github, mapProfileToUser };

	return providers;
}

export function configuredSocialProviderIds(env: Environment): SocialProviderId[] {
	return SOCIAL_PROVIDER_IDS.filter((provider) => credentials(env, provider));
}

export async function prepareSignupUser(user: { emailVerified?: boolean } & Record<string, unknown>, disabled: readonly LanguageCode[] = []) {
	const state = await getOAuthState();
	if (state && user.emailVerified !== true) {
		throw new APIError("BAD_REQUEST", {
			code: "OAUTH_EMAIL_NOT_VERIFIED",
			message: OAUTH_EMAIL_NOT_VERIFIED_MESSAGE,
		});
	}

	const activeLanguage = state ? oauthActiveLanguage(state, disabled) : user.activeLanguage;
	// This hook is the common creation boundary for form, direct HTTP and OAuth sign-ups.
	if (typeof activeLanguage === "string" && disabled.includes(activeLanguage as LanguageCode)) {
		throw new APIError("BAD_REQUEST", {
			code: "ACTIVE_LANGUAGE_DISABLED",
			message: "This language is opening soon. Choose another one for now.",
		});
	}
	return state ? { data: { activeLanguage } } : undefined;
}
