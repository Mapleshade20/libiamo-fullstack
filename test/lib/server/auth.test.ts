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

vi.mock("$env/dynamic/private", () => ({
	env: {
		ORIGIN: "http://localhost:5173",
		BETTER_AUTH_SECRET: "test-secret",
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
		expect(config.baseURL).toBe("http://localhost:5173");
		expect(config.secret).toBe("test-secret");
		expect(config.emailAndPassword.enabled).toBe(true);
		expect(config.emailAndPassword.requireEmailVerification).toBe(true);
		expect(config.emailAndPassword.minPasswordLength).toBe(8);
		expect(config.emailVerification.sendOnSignUp).toBe(true);
		expect(config.emailVerification.autoSignInAfterVerification).toBe(true);
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
});
