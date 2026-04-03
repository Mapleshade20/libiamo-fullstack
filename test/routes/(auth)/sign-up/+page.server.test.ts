import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth";
import { actions, load } from "../../../../src/routes/(auth)/sign-up/+page.server";

// Mock auth module so tests never call the real auth provider/network.
vi.mock("$lib/server/auth", () => ({
	auth: {
		api: {
			signUpEmail: vi.fn(),
		},
	},
}));

// Use hoisted mocks because vi.mock() factories are hoisted to the top by Vitest.
// This guarantees these spies exist before mocked modules reference them.
const { mockOnConflictDoNothing, mockValues, mockInsert } = vi.hoisted(() => {
	const mockOnConflictDoNothing = vi.fn();
	const mockValues = vi.fn(() => ({
		onConflictDoNothing: mockOnConflictDoNothing,
	}));
	const mockInsert = vi.fn(() => ({
		values: mockValues,
	}));
	return { mockOnConflictDoNothing, mockValues, mockInsert };
});

vi.mock("$lib/server/db", () => ({
	db: {
		insert: mockInsert,
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	userLearningProfile: Symbol("userLearningProfile"),
}));

// Minimal APIError mock used by route code inside `instanceof APIError` checks.
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

describe("Sign-up +page.server", () => {
	beforeEach(() => {
		// Reset call counts and one-off mock behaviors between tests.
		vi.clearAllMocks();
	});

	describe("load function", () => {
		it("should redirect to home if user is already logged in", async () => {
			const event = {
				locals: { user: { id: "test-user" } },
			} as any;

			try {
				await load(event);
				expect.fail("Should have thrown a redirect");
			} catch (e: any) {
				// In SvelteKit, redirect() throws. We assert the thrown status/location.
				expect(e.status).toBe(302);
				expect(e.location).toBe("/");
			}
		});

		it("should return empty object if user is not logged in", async () => {
			const event = {
				locals: { user: null },
			} as any;

			const result = await load(event);
			expect(result).toEqual({});
		});
	});

	describe("default action", () => {
		// Helper to build a fake SvelteKit action event with FormData + headers.
		const createEvent = (formDataEntries: Record<string, string>) => {
			const formData = new FormData();
			for (const [key, value] of Object.entries(formDataEntries)) {
				formData.append(key, value);
			}

			return {
				request: {
					formData: async () => formData,
					headers: new Headers(),
				},
			} as any;
		};

		it("should return 400 with validation errors for invalid data", async () => {
			// Invalid shape should fail before calling auth service.
			const event = createEvent({
				email: "not-an-email",
				password: "short",
				// Missing required fields
			});

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors).toBeDefined();
			expect(result.data?.errors?.email).toBeDefined();
			expect(result.data?.errors?.password).toBeDefined();
			expect(result.data?.errors?.name).toBeDefined();
			expect(result.data?.errors?.activeLanguage).toBeDefined();
			expect(auth.api.signUpEmail).not.toHaveBeenCalled();
		});

		it("should successfully sign up and insert profile, then redirect", async () => {
			// Happy path: auth succeeds, DB profile insert is attempted, then redirect.
			const validData = {
				email: "test@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "en",
			};
			const event = createEvent(validData);

			// 模拟注册成功
			vi.mocked(auth.api.signUpEmail).mockResolvedValueOnce({
				user: { id: "new-user-id" },
			} as any);

			try {
				await actions.default(event);
				expect.fail("Should have thrown a redirect");
			} catch (e: any) {
				// Redirect means the server action reached the success exit.
				expect(e.status).toBe(302);
				expect(e.location).toBe("/verify?pending=1");
			}

			// 校验 auth API 是否带着正确数据被调用
			expect(auth.api.signUpEmail).toHaveBeenCalledWith({
				body: validData,
				headers: event.request.headers,
			});

			// 校验数据库插入
			expect(mockInsert).toHaveBeenCalled();
			expect(mockValues).toHaveBeenCalledWith({
				userId: "new-user-id",
				language: "en",
			});
			expect(mockOnConflictDoNothing).toHaveBeenCalled();
		});

		it("should return 400 on APIError from auth service", async () => {
			// Known business error from auth provider should map to 400.
			const validData = {
				email: "taken@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "es",
			};
			const event = createEvent(validData);

			// 模拟 API Error (如邮箱已注册)
			vi.mocked(auth.api.signUpEmail).mockRejectedValueOnce(
				new (await import("better-auth/api")).APIError("BAD_REQUEST", { message: "Email already in use" }),
			);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Email already in use");
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("should return 500 on unexpected error", async () => {
			// Unknown runtime errors should map to 500.
			const validData = {
				email: "crash@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "fr",
			};
			const event = createEvent(validData);

			// 模拟未知错误
			vi.mocked(auth.api.signUpEmail).mockRejectedValueOnce(new Error("Database offline"));

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(500);
			expect(result.data?.message).toBe("Unexpected error");
			expect(mockInsert).not.toHaveBeenCalled();
		});
		it("should return 400 with a generic message on APIError without message", async () => {
			// If APIError has empty message, route should use fallback message.
			const validData = {
				email: "nomessage@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "es",
			};
			const event = createEvent(validData);

			// 模拟不带 message 的 API Error (利用没有传 opts 来 fallback 我们 mock 里的 name )
			const apiError = new (await import("better-auth/api")).APIError("BAD_REQUEST");
			apiError.message = "";
			vi.mocked(auth.api.signUpEmail).mockRejectedValueOnce(apiError);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Registration failed");
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("should handle auth API returning successfully but missing user data", async () => {
			// Edge case: auth call resolves but user payload is null.
			const validData = {
				email: "test-nouser@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "en",
			};
			const event = createEvent(validData);

			// 模拟注册成功但未返回 user
			vi.mocked(auth.api.signUpEmail).mockResolvedValueOnce({
				user: null,
			} as any);

			try {
				await actions.default(event);
				expect.fail("Should have thrown a redirect");
			} catch (e: any) {
				expect(e.status).toBe(302);
				expect(e.location).toBe("/verify?pending=1");
			}

			// No user id means DB profile insert must not run.
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("should handle empty form data correctly", async () => {
			// Empty strings should fail schema validation.
			const event = {
				request: {
					formData: async () => {
						const fd = new FormData();
						// Explicitly provide empty strings instead of missing fields.
						fd.append("email", "");
						fd.append("password", "");
						fd.append("name", "");
						fd.append("activeLanguage", "");
						return fd;
					},
					headers: new Headers(),
				},
			} as any;

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400); // Because empty strings violate schema
			expect(result.data?.errors).toBeDefined();
		});

		it("should test fallback paths when formData.get returns null", async () => {
			// Simulate missing form entries so route fallback `?? ''` path is exercised.
			const event = {
				request: {
					formData: async () => {
						const fd = {
							// Return null for all keys to mimic absent fields.
							get: (v: string) => null,
						};
						return fd;
					},
					headers: new Headers(),
				},
			} as any;

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors).toBeDefined();
		});

		it("should test generic message fallback logic", async () => {
			// Another way to ensure fallback message behavior with an APIError subclass.
			const validData = {
				email: "fallback@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "es",
			};
			const event = createEvent(validData);

			// Keep instanceof APIError true by extending the mocked APIError class.
			const { APIError } = await import("better-auth/api");
			class EmptyMessageAPIError extends APIError {
				constructor() {
					super("BAD_REQUEST");
					this.message = ""; // force empty to trigger fallback text
				}
			}

			vi.mocked(auth.api.signUpEmail).mockRejectedValueOnce(new EmptyMessageAPIError());

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Registration failed");
		});
	});
});
