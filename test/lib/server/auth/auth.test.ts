import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBetterAuth, mockDrizzleAdapter, mockSveltekitCookies, mockSendEmail } = vi.hoisted(() => ({
	mockBetterAuth: vi.fn((config: unknown) => ({ config })),
	mockDrizzleAdapter: vi.fn(() => "drizzle-adapter"),
	mockSveltekitCookies: vi.fn(() => "cookie-plugin"),
	mockSendEmail: vi.fn(),
}));

vi.mock("better-auth", () => ({
	betterAuth: mockBetterAuth,
}));

vi.mock("better-auth/adapters/drizzle", () => ({
	drizzleAdapter: mockDrizzleAdapter,
}));

vi.mock("better-auth/svelte-kit", () => ({
	sveltekitCookies: mockSveltekitCookies,
}));

vi.mock("$app/server", () => ({
	getRequestEvent: vi.fn(),
}));

vi.mock("$app/paths", () => ({ base: "", assets: "" }));

vi.mock("$env/dynamic/private", () => ({
	env: {
		ORIGIN: "http://localhost:5173",
		BETTER_AUTH_SECRET: "test-secret",
		GOOGLE_CLIENT_ID: "google-id",
		GOOGLE_CLIENT_SECRET: "google-secret",
		GITHUB_CLIENT_ID: "github-id",
		GITHUB_CLIENT_SECRET: "github-secret",
	},
}));

vi.mock("$lib/server/db", () => ({
	db: { __brand: "db" },
}));

vi.mock("$lib/server/auth/email", () => ({
	sendEmail: mockSendEmail,
	emailVerificationHtml: vi.fn((email: string, url: string) => `<html>verify ${email} ${url}</html>`),
	resetPasswordHtml: vi.fn((email: string, url: string) => `<html>reset ${email} ${url}</html>`),
}));

describe("auth server configuration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("wires better-auth with required email verification settings", async () => {
		await import("$lib/server/auth/auth");

		expect(mockDrizzleAdapter).toHaveBeenCalledTimes(1);
		expect(mockSveltekitCookies).toHaveBeenCalledTimes(1);
		expect(mockBetterAuth).toHaveBeenCalledTimes(1);

		const config = mockBetterAuth.mock.calls[0]?.[0] as any;
		// Better Auth only appends its default "/api/auth" when baseURL has no path,
		// so we always spell the mount point out and pin basePath to "/".
		expect(config.baseURL).toBe("http://localhost:5173/api/auth");
		expect(config.basePath).toBe("/");
		expect(config.advanced.defaultCookieAttributes.path).toBe("/");
		expect(config.secret).toBe("test-secret");
		expect(config.emailAndPassword.enabled).toBe(true);
		expect(config.emailAndPassword.requireEmailVerification).toBe(true);
		expect(config.emailAndPassword.minPasswordLength).toBe(8);
		expect(config.emailVerification.sendOnSignUp).toBe(true);
		expect(config.emailVerification.autoSignInAfterVerification).toBe(true);
		expect(config.account.encryptOAuthTokens).toBe(true);
		// Relaxes only the linking an authenticated session asked for. Implicit linking
		// on sign-in never reads it, so the signed-out path is untouched.
		expect(config.account.accountLinking.allowDifferentEmails).toBe(true);
		// The per-request `errorCallbackURL` travels inside the OAuth state, so a state
		// that will not parse — an expired one, usually — has only this to fall back on.
		expect(config.onAPIError.errorURL).toBe("/sign-in");
		expect(config.socialProviders).toMatchObject({
			google: {
				clientId: "google-id",
				clientSecret: "google-secret",
				mapProfileToUser: expect.any(Function),
			},
			github: {
				clientId: "github-id",
				clientSecret: "github-secret",
				mapProfileToUser: expect.any(Function),
			},
		});
		// Absent, so an identity arriving at Sign In for the first time is signed up
		// there instead of being sent to Sign Up to repeat the round-trip.
		expect(config.socialProviders.google).not.toHaveProperty("disableImplicitSignUp");
		expect(config.socialProviders.github).not.toHaveProperty("disableImplicitSignUp");
		// No `trustedProviders`: a provider must have verified an address before Better
		// Auth will attach that identity to an account that already exists.
		expect(config.account.accountLinking).not.toHaveProperty("trustedProviders");
		expect(config.databaseHooks.user.create.before).toEqual(expect.any(Function));
		expect(config.plugins).toEqual(["cookie-plugin"]);
	});

	it("sends verification email with expected content", async () => {
		await import("$lib/server/auth/auth");

		const config = mockBetterAuth.mock.calls[0]?.[0] as any;
		await config.emailVerification.sendVerificationEmail({
			user: { email: "learner@example.com" },
			url: "https://example.com/verify-token",
		});

		expect(mockSendEmail).toHaveBeenCalledWith({
			to: "learner@example.com",
			subject: "Libiamo | Verify your email address",
			text: expect.stringContaining(
				"Click the link to verify your email: https://example.com/verify-token?callbackURL=%2Fverify%3Fsuccess%3D1&errorURL=%2Fverify",
			),
			html: expect.any(String),
		});
	});

	it("sends reset password email with expected content", async () => {
		await import("$lib/server/auth/auth");

		const config = mockBetterAuth.mock.calls[0]?.[0] as any;
		await config.emailAndPassword.sendResetPassword({
			user: { email: "learner@example.com" },
			url: "https://example.com/reset-token",
		});

		expect(mockSendEmail).toHaveBeenCalledWith({
			to: "learner@example.com",
			subject: "Libiamo | Reset your password",
			text: "Click the link to reset your password: https://example.com/reset-token",
			html: expect.any(String),
		});
	});

	describe("sub-path deployment", () => {
		beforeEach(() => {
			vi.resetModules();
			vi.doMock("$app/paths", () => ({ base: "/se-projects/libiamo", assets: "" }));
		});

		it("mounts the auth router and scopes cookies under the base path", async () => {
			await import("$lib/server/auth/auth");

			const config = mockBetterAuth.mock.calls[0]?.[0] as any;
			expect(config.baseURL).toBe("http://localhost:5173/se-projects/libiamo/api/auth");
			expect(config.basePath).toBe("/");
			// Many projects share this origin, so cookies must not escape our prefix.
			expect(config.advanced.defaultCookieAttributes.path).toBe("/se-projects/libiamo");
		});

		it("points verification callbacks at base-path-aware routes", async () => {
			await import("$lib/server/auth/auth");

			const config = mockBetterAuth.mock.calls[0]?.[0] as any;
			await config.emailVerification.sendVerificationEmail({
				user: { email: "learner@example.com" },
				url: "https://example.com/verify-token",
			});

			const sent = mockSendEmail.mock.calls[0]?.[0] as { text: string };
			const callbackURL = new URL(sent.text.split(": ").pop() as string).searchParams;
			expect(callbackURL.get("callbackURL")).toBe("/se-projects/libiamo/verify?success=1");
			expect(callbackURL.get("errorURL")).toBe("/se-projects/libiamo/verify");
		});
	});
});
