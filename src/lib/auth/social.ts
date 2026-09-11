export const SOCIAL_PROVIDERS = [
	{ id: "google", label: "Google" },
	{ id: "github", label: "GitHub" },
] as const;

export const SOCIAL_PROVIDER_IDS = SOCIAL_PROVIDERS.map(({ id }) => id);
export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]["id"];

export function isSocialProviderId(value: unknown): value is SocialProviderId {
	return typeof value === "string" && SOCIAL_PROVIDER_IDS.some((provider) => provider === value);
}

export function socialAuthErrorMessage(code: string | null): string | null {
	if (!code) return null;
	const normalizedCode = code.toLowerCase();
	if (["access_denied", "user_cancelled", "cancelled"].includes(normalizedCode)) {
		return "Sign-in was canceled. You can try again when you’re ready.";
	}
	if (normalizedCode === "signup_disabled") {
		return "To create a new Libiamo account, choose Sign Up below and select a learning language.";
	}
	return "Google or GitHub sign-in could not be completed. Please try again.";
}
