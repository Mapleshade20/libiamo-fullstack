import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOAuthState } = vi.hoisted(() => ({ getOAuthState: vi.fn() }));

vi.mock("better-auth/api", async (importOriginal) => {
	const original = await importOriginal<typeof import("better-auth/api")>();
	return { ...original, getOAuthState };
});

import { configuredSocialProviderIds, configuredSocialProviders, mapOAuthProfileToUser, prepareSignupUser } from "$lib/server/auth/social";

describe("social authentication configuration", () => {
	beforeEach(() => {
		getOAuthState.mockReset();
	});

	it("registers only providers with both credentials", () => {
		const env = {
			GOOGLE_CLIENT_ID: " google-id ",
			GOOGLE_CLIENT_SECRET: "google-secret",
			GITHUB_CLIENT_ID: "github-id",
		};

		expect(configuredSocialProviderIds(env)).toEqual(["google"]);
		expect(configuredSocialProviders(env)).toMatchObject({
			google: {
				clientId: "google-id",
				clientSecret: "google-secret",
				mapProfileToUser: expect.any(Function),
			},
		});
		// Sign In creates the account itself rather than sending a first-time visitor
		// back through Sign Up to repeat the round-trip.
		expect(configuredSocialProviders(env).google).not.toHaveProperty("disableImplicitSignUp");
	});

	it("maps the selected learning language into a new OAuth user", async () => {
		getOAuthState.mockResolvedValue({ activeLanguage: "fr" });

		await expect(mapOAuthProfileToUser()).resolves.toEqual({ activeLanguage: "fr" });
	});
	it("wires language availability into provider mapping without refusing returning users", async () => {
		const provider = configuredSocialProviders({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", DISABLED_LANGUAGES: "en,es" }).google;
		if (!provider || typeof provider === "function" || !provider.mapProfileToUser) throw new Error("Google mapper is missing");
		getOAuthState.mockResolvedValue({});
		await expect(provider.mapProfileToUser({} as never)).resolves.toEqual({ activeLanguage: "fr" });
		getOAuthState.mockResolvedValue({ activeLanguage: "en" });
		await expect(provider.mapProfileToUser({} as never)).resolves.toEqual({ activeLanguage: "en" });
	});

	it("accepts a verified OAuth user with a supported learning language", async () => {
		getOAuthState.mockResolvedValue({ activeLanguage: "fr" });

		await expect(prepareSignupUser({ emailVerified: true })).resolves.toEqual({ data: { activeLanguage: "fr" } });
	});

	// Only Sign Up asks for a language, so arriving from Sign In there is nothing to
	// carry. `activeLanguage` is NOT NULL with no database default, and refusing
	// instead would break "Continue with Google" for exactly the people it serves.
	it("falls back to English when the flow carried no learning language", async () => {
		getOAuthState.mockResolvedValue({});

		await expect(mapOAuthProfileToUser()).resolves.toEqual({ activeLanguage: "en" });
		await expect(prepareSignupUser({ emailVerified: true })).resolves.toEqual({ data: { activeLanguage: "en" } });
	});

	it("rejects OAuth user creation without a verified email", async () => {
		getOAuthState.mockResolvedValue({ activeLanguage: "ja" });

		await expect(prepareSignupUser({ emailVerified: false })).rejects.toMatchObject({
			body: { code: "OAUTH_EMAIL_NOT_VERIFIED" },
		});
	});

	it("rejects OAuth user creation without a supported learning language", async () => {
		getOAuthState.mockResolvedValue({ activeLanguage: "de" });

		await expect(prepareSignupUser({ emailVerified: true })).rejects.toMatchObject({
			body: { code: "INVALID_ACTIVE_LANGUAGE" },
		});
	});

	it("leaves email and password user creation unchanged", async () => {
		getOAuthState.mockResolvedValue(null);

		await expect(prepareSignupUser({ emailVerified: false, activeLanguage: "es" })).resolves.toBeUndefined();
	});

	it("leaves required-field validation to email and password sign-up", async () => {
		getOAuthState.mockResolvedValue(null);

		await expect(prepareSignupUser({ emailVerified: false })).resolves.toBeUndefined();
	});
});
