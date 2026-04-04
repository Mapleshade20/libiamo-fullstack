import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth";
import { actions, load } from "../../../../src/routes/(auth)/sign-in/+page.server";

vi.mock("$lib/server/auth", () => ({
	auth: {
		api: {
			signInEmail: vi.fn(),
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
			expect(result).toEqual({ resetSuccess: true });
		});

		it("returns resetSuccess false when reset query is missing", async () => {
			const event = {
				locals: { user: null },
				url: new URL("https://example.com/sign-in"),
			} as any;

			const result = await load(event);
			expect(result).toEqual({ resetSuccess: false });
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

			try {
				await actions.default(event);
				expect.fail("Should have thrown a redirect");
			} catch (error: any) {
				expect(error.status).toBe(302);
				expect(error.location).toBe("/");
			}

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
});
