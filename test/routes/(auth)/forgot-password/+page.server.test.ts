import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth";
import { actions, load } from "../../../../src/routes/(auth)/forgot-password/+page.server";

vi.mock("$lib/server/auth", () => ({
	auth: {
		api: {
			requestPasswordReset: vi.fn(),
			resetPassword: vi.fn(),
		},
	},
}));

vi.mock("better-auth/api", () => {
	class MockAPIError extends Error {
		constructor(code: string, opts?: { message: string }) {
			super();
			this.message = opts?.message || code;
			this.name = "APIError";
		}
	}

	return { APIError: MockAPIError };
});

describe("Forgot-password +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("load function", () => {
		it("returns hasToken false when token is missing", async () => {
			const result = await load({
				url: new URL("https://example.com/forgot-password"),
			} as any);

			expect(result).toEqual({ hasToken: false, token: null });
		});

		it("returns hasToken true when token exists", async () => {
			const result = await load({
				url: new URL("https://example.com/forgot-password?token=abc123"),
			} as any);

			expect(result).toEqual({ hasToken: true, token: "abc123" });
		});
	});

	describe("requestReset action", () => {
		const createEvent = (entries: Record<string, string>) => {
			const formData = new FormData();
			for (const [key, value] of Object.entries(entries)) {
				formData.append(key, value);
			}

			return {
				request: {
					formData: async () => formData,
				},
			} as any;
		};

		it("returns 400 for invalid email", async () => {
			const result = (await actions.requestReset(
				createEvent({
					email: "bad-email",
				}),
			)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.email).toBeDefined();
			expect(auth.api.requestPasswordReset).not.toHaveBeenCalled();
		});

		it("returns 400 when email field is missing", async () => {
			const result = (await actions.requestReset(createEvent({}))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.email).toBeDefined();
			expect(result.data?.values).toEqual({ email: "" });
		});

		it("calls auth api and returns success for valid input", async () => {
			const result = await actions.requestReset(
				createEvent({
					email: "user@example.com",
				}),
			);

			expect(auth.api.requestPasswordReset).toHaveBeenCalledWith({
				body: {
					email: "user@example.com",
					redirectTo: "/forgot-password",
				},
			});
			expect(result).toEqual({ emailSent: true });
		});

		it("still returns success when auth api throws", async () => {
			vi.mocked(auth.api.requestPasswordReset).mockRejectedValueOnce(new Error("network"));

			const result = await actions.requestReset(
				createEvent({
					email: "user@example.com",
				}),
			);

			expect(result).toEqual({ emailSent: true });
		});
	});

	describe("resetPassword action", () => {
		const createEvent = (entries: Record<string, string>) => {
			const formData = new FormData();
			for (const [key, value] of Object.entries(entries)) {
				formData.append(key, value);
			}

			return {
				request: {
					formData: async () => formData,
				},
			} as any;
		};

		it("returns 400 for invalid reset payload", async () => {
			const result = (await actions.resetPassword(
				createEvent({
					newPassword: "short",
					token: "",
				}),
			)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.resetErrors?.newPassword).toBeDefined();
			expect(auth.api.resetPassword).not.toHaveBeenCalled();
		});

		it("returns 400 when reset fields are missing", async () => {
			const result = (await actions.resetPassword(createEvent({}))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.resetErrors?.newPassword).toBeDefined();
			expect(result.data?.resetErrors?.token).toBeDefined();
		});

		it("resets password and redirects on success", async () => {
			try {
				await actions.resetPassword(
					createEvent({
						newPassword: "new-password-123",
						token: "reset-token",
					}),
				);
				expect.fail("Should have thrown a redirect");
			} catch (error: any) {
				expect(error.status).toBe(302);
				expect(error.location).toBe("/sign-in?reset=success");
			}

			expect(auth.api.resetPassword).toHaveBeenCalledWith({
				body: {
					newPassword: "new-password-123",
					token: "reset-token",
				},
			});
		});

		it("maps APIError to 400", async () => {
			vi.mocked(auth.api.resetPassword).mockRejectedValueOnce(
				new (await import("better-auth/api")).APIError("BAD_REQUEST", { message: "Token expired" }),
			);

			const result = (await actions.resetPassword(
				createEvent({
					newPassword: "new-password-123",
					token: "reset-token",
				}),
			)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.resetMessage).toBe("Token expired");
		});

		it("uses fallback message when APIError has empty message", async () => {
			const apiError = new (await import("better-auth/api")).APIError("BAD_REQUEST");
			apiError.message = "";
			vi.mocked(auth.api.resetPassword).mockRejectedValueOnce(apiError);

			const result = (await actions.resetPassword(
				createEvent({
					newPassword: "new-password-123",
					token: "reset-token",
				}),
			)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.resetMessage).toBe("Reset failed");
		});

		it("maps unknown errors to 500", async () => {
			vi.mocked(auth.api.resetPassword).mockRejectedValueOnce(new Error("boom"));

			const result = (await actions.resetPassword(
				createEvent({
					newPassword: "new-password-123",
					token: "reset-token",
				}),
			)) as ActionFailure<any>;

			expect(result.status).toBe(500);
			expect(result.data?.resetMessage).toBe("Unexpected error");
		});
	});
});
