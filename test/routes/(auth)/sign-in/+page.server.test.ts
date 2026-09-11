import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth/auth";
import { actions, load } from "$routes/(auth)/sign-in/+page.server";

vi.mock("$lib/server/auth/auth", () => ({
	auth: {
		api: {
			signInEmail: vi.fn(),
			signInSocial: vi.fn(),
		},
	},
}));

vi.mock("$env/dynamic/private", () => ({
	env: {
		GOOGLE_CLIENT_ID: "google-id",
		GOOGLE_CLIENT_SECRET: "google-secret",
		GITHUB_CLIENT_ID: "github-id",
		GITHUB_CLIENT_SECRET: "github-secret",
	},
}));

vi.mock("better-auth/api", () => {
	class MockAPIError extends Error {
		constructor(code: string, opts?: { message: string }) {
			super(opts?.message ?? code);
			this.name = "APIError";
		}
	}

	return { APIError: MockAPIError };
});

describe("Sign-in +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("load function", () => {
		it("redirects to home when user exists", async () => {
			const event = {
				locals: { user: { id: "user-1" } },
				url: new URL("https://example.com/sign-in"),
			} as any;

			try {
				await load(event);
				expect.fail("Should have thrown a redirect");
			} catch (error: any) {
				expect(error.status).toBe(302);
				expect(error.location).toBe("/");
			}
		});

		it("returns resetSuccess true when reset query is success", async () => {
			const event = {
				locals: { user: null },
				url: new URL("https://example.com/sign-in?reset=success"),
			} as any;

			const result = await load(event);
			expect(result).toEqual({
				resetSuccess: true,
				socialProviders: ["google", "github"],
				socialAuthError: null,
			});
		});

		it("returns configured providers and maps an OAuth error", async () => {
			const event = {
				locals: { user: null },
				url: new URL("https://example.com/sign-in?error=access_denied"),
			} as any;

			const result = await load(event);
			expect(result).toEqual({
				resetSuccess: false,
				socialProviders: ["google", "github"],
				socialAuthError: "Sign-in was canceled. You can try again when you’re ready.",
			});
		});

		it("directs a new OAuth user to Sign Up", async () => {
			const event = {
				locals: { user: null },
				url: new URL("https://example.com/sign-in?error=signup_disabled"),
			} as any;

			const result = await load(event);
			expect(result).toMatchObject({
				socialAuthError: "To create a new Libiamo account, choose Sign Up below and select a learning language.",
			});
		});
	});

	describe("default action", () => {
		const createEvent = (entries: Record<string, string>) => {
			const formData = new FormData();
			for (const [key, value] of Object.entries(entries)) {
				formData.append(key, value);
			}

			return {
				request: {
					formData: async () => formData,
					headers: new Headers(),
				},
			} as any;
		};

		it("returns 400 for invalid payload", async () => {
			const result = (await actions.default(
				createEvent({
					email: "bad-email",
					password: "",
				}),
			)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.email).toBeDefined();
			expect(result.data?.errors?.password).toBeDefined();
			expect(auth.api.signInEmail).not.toHaveBeenCalled();
		});

		it("returns 400 when form fields are missing", async () => {
			const result = (await actions.default(createEvent({}))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.email).toBeDefined();
			expect(result.data?.errors?.password).toBeDefined();
			expect(result.data?.values).toEqual({
				email: "",
				password: "",
			});
		});

		it("signs in and redirects on success", async () => {
			const event = createEvent({
				email: "user@example.com",
				password: "secure-pass",
			});

			vi.mocked(auth.api.signInEmail).mockResolvedValueOnce({} as never);

			await expect(actions.default(event)).rejects.toMatchObject({ status: 302, location: "/" });

			expect(auth.api.signInEmail).toHaveBeenCalledWith({
				body: {
					email: "user@example.com",
					password: "secure-pass",
				},
				headers: event.request.headers,
			});
		});

		it("maps APIError to 400", async () => {
			const event = createEvent({
				email: "user@example.com",
				password: "secure-pass",
			});

			vi.mocked(auth.api.signInEmail).mockRejectedValueOnce(
				new (await import("better-auth/api")).APIError("BAD_REQUEST", { message: "Invalid credentials" }),
			);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Invalid credentials");
			expect(result.data?.values).toEqual({
				email: "user@example.com",
				password: "secure-pass",
			});
		});

		it("uses fallback message when APIError message is empty", async () => {
			const event = createEvent({
				email: "user@example.com",
				password: "secure-pass",
			});

			const apiError = new (await import("better-auth/api")).APIError("BAD_REQUEST");
			apiError.message = "";
			vi.mocked(auth.api.signInEmail).mockRejectedValueOnce(apiError);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Sign in failed");
		});

		it("maps unknown errors to 500", async () => {
			const event = createEvent({
				email: "user@example.com",
				password: "secure-pass",
			});

			vi.mocked(auth.api.signInEmail).mockRejectedValueOnce(new Error("Unexpected"));

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(500);
			expect(result.data?.message).toBe("Unexpected error");
			expect(result.data?.values).toEqual({
				email: "user@example.com",
				password: "secure-pass",
			});
		});
	});

	describe("social action", () => {
		const createEvent = (provider: string) => {
			const formData = new FormData();
			formData.set("provider", provider);
			return {
				request: { formData: async () => formData, headers: new Headers({ origin: "https://example.com" }) },
			} as any;
		};

		it("starts provider sign-in without requesting sign-up", async () => {
			const event = createEvent("google");
			vi.mocked(auth.api.signInSocial).mockResolvedValueOnce({
				url: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
				redirect: false,
			} as never);

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 303,
				location: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
			});
			expect(auth.api.signInSocial).toHaveBeenCalledWith({
				body: {
					provider: "google",
					callbackURL: "/",
					errorCallbackURL: "/sign-in",
					disableRedirect: true,
				},
				headers: event.request.headers,
			});
		});

		it("rejects an unavailable provider", async () => {
			const result = (await actions.default(createEvent("microsoft"))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("This sign-in method is unavailable.");
			expect(auth.api.signInSocial).not.toHaveBeenCalled();
		});
	});
});
