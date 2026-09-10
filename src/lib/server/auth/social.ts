import type { BetterAuthOptions } from "better-auth";
import { APIError, getOAuthState } from "better-auth/api";
import { SOCIAL_PROVIDER_IDS, type SocialProviderId } from "$lib/auth/social";
import { LANGUAGE_CODES, type LanguageCode } from "$lib/constants";

type Environment = Record<string, string | undefined>;
type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

function credentials(env: Environment, provider: SocialProviderId) {
	const clientId = env[`${provider.toUpperCase()}_CLIENT_ID`]?.trim();
	const clientSecret = env[`${provider.toUpperCase()}_CLIENT_SECRET`]?.trim();
	return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function oauthActiveLanguage(state: Record<string, unknown>) {
	const activeLanguage = state.activeLanguage;
	if (typeof activeLanguage === "string" && LANGUAGE_CODES.includes(activeLanguage as LanguageCode)) return activeLanguage;
	throw new APIError("BAD_REQUEST", {
		code: "INVALID_ACTIVE_LANGUAGE",
		message: "Choose a supported learning language.",
	});
}

export async function mapOAuthProfileToUser() {
	const state = await getOAuthState();
	return state?.activeLanguage === undefined ? {} : { activeLanguage: oauthActiveLanguage(state) };
}

export function configuredSocialProviders(env: Environment): SocialProviders {
	const providers: SocialProviders = {};
	const google = credentials(env, "google");
	const github = credentials(env, "github");

	if (google) providers.google = { ...google, disableImplicitSignUp: true, mapProfileToUser: mapOAuthProfileToUser };
	if (github) providers.github = { ...github, disableImplicitSignUp: true, mapProfileToUser: mapOAuthProfileToUser };

	return providers;
}

export function configuredSocialProviderIds(env: Environment): SocialProviderId[] {
	return SOCIAL_PROVIDER_IDS.filter((provider) => credentials(env, provider));
}

export async function prepareOAuthUser(user: { emailVerified?: boolean } & Record<string, unknown>) {
	const state = await getOAuthState();
	if (!state) return;
	if (user.emailVerified !== true) {
		throw new APIError("BAD_REQUEST", {
			code: "OAUTH_EMAIL_NOT_VERIFIED",
			message: "The provider did not verify this email address.",
		});
	}

	return { data: { activeLanguage: oauthActiveLanguage(state) } };
}
