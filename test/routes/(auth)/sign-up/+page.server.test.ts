import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth";
import { actions, load } from "$routes/(auth)/sign-up/+page.server";

vi.mock("$lib/server/auth", () => ({
	auth: {
		api: {
			signUpEmail: vi.fn(),
		},
	},
}));

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
	userApiKey: Symbol("userApiKey"),
}));

const { mockEncryptApiKey, mockVerifyApiKey } = vi.hoisted(() => ({
	mockEncryptApiKey: vi.fn((k: string) => `encrypted:${k}`),
	mockVerifyApiKey: vi.fn(async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
}));

vi.mock("$lib/server/api-key-crypto", () => ({
	encryptApiKey: mockEncryptApiKey,
	verifyApiKey: mockVerifyApiKey,
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

describe("Sign-up +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("load function", () => {
		it("should redirect to home if user is already logged in", async () => {
			const event = {
				locals: { user: { id: "test-user" } },
			} as any;

			await expect(load(event)).rejects.toMatchObject({ status: 302, location: "/" });
		});

		it("should return empty object if user is not logged in", async () => {
			const event = {
				locals: { user: null },
			} as any;

			const result = await load(event);
			expect(result).toEqual({});
		});
	});

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

	describe("default action", () => {
		it("should return 400 with validation errors for invalid data", async () => {
			const event = createEvent({
				email: "not-an-email",
				password: "short",
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
			const validData = {
				email: "test@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "en",
				timezone: "UTC",
			};
			const event = createEvent(validData);

			vi.mocked(auth.api.signUpEmail).mockResolvedValueOnce({
				user: { id: "new-user-id" },
			} as any);

			await expect(actions.default(event)).rejects.toMatchObject({ status: 302, location: "/verify?pending=1" });

			expect(auth.api.signUpEmail).toHaveBeenCalledWith({
				body: {
					email: validData.email,
					password: validData.password,
					name: validData.name,
					activeLanguage: validData.activeLanguage,
					timezone: validData.timezone,
				},
				headers: event.request.headers,
			});

			expect(mockInsert).toHaveBeenCalled();
			expect(mockValues).toHaveBeenCalledWith({
				userId: "new-user-id",
				language: "en",
			});
			expect(mockOnConflictDoNothing).toHaveBeenCalled();
		});

		it("should return 400 on APIError from auth service", async () => {
			const validData = {
				email: "taken@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "es",
			};
			const event = createEvent(validData);

			vi.mocked(auth.api.signUpEmail).mockRejectedValueOnce(
				new (await import("better-auth/api")).APIError("BAD_REQUEST", { message: "Email already in use" }),
			);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Email already in use");
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("should return 500 on unexpected error", async () => {
			const validData = {
				email: "crash@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "fr",
			};
			const event = createEvent(validData);

			vi.mocked(auth.api.signUpEmail).mockRejectedValueOnce(new Error("Database offline"));

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(500);
			expect(result.data?.message).toBe("Unexpected error");
			expect(mockInsert).not.toHaveBeenCalled();
		});
		it("should return 400 with a generic message on APIError without message", async () => {
			const validData = {
				email: "nomessage@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "es",
			};
			const event = createEvent(validData);

			const apiError = new (await import("better-auth/api")).APIError("BAD_REQUEST");
			apiError.message = "";
			vi.mocked(auth.api.signUpEmail).mockRejectedValueOnce(apiError);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Registration failed");
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("should handle auth API returning successfully but missing user data", async () => {
			const validData = {
				email: "test-nouser@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "en",
			};
			const event = createEvent(validData);

			vi.mocked(auth.api.signUpEmail).mockResolvedValueOnce({
				user: null,
			} as any);

			await expect(actions.default(event)).rejects.toMatchObject({ status: 302, location: "/verify?pending=1" });

			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("should handle empty form data correctly", async () => {
			const event = {
				request: {
					formData: async () => {
						const fd = new FormData();
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

			expect(result.status).toBe(400);
			expect(result.data?.errors).toBeDefined();
		});

		it("should test fallback paths when formData.get returns null", async () => {
			const event = {
				request: {
					formData: async () => {
						const fd = {
							get: (_v: string) => null,
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
			const validData = {
				email: "fallback@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "es",
			};
			const event = createEvent(validData);

			const { APIError } = await import("better-auth/api");
			class EmptyMessageAPIError extends APIError {
				constructor() {
					super("BAD_REQUEST");
					this.message = "";
				}
			}

			vi.mocked(auth.api.signUpEmail).mockRejectedValueOnce(new EmptyMessageAPIError());

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Registration failed");
		});
	});

	// ── BYOK (Bring Your Own Key) ─────────────────────────────────────
	describe("BYOK", () => {
		it("verifies BYOK before signup and stores on success", async () => {
			const event = createEvent({
				email: "byok@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "en",
				apiKey: "sk-test",
				apiBaseUrl: "https://api.example.com/v1",
				apiModel: "test-model",
			});

			mockVerifyApiKey.mockResolvedValue({ ok: true });
			vi.mocked(auth.api.signUpEmail).mockResolvedValueOnce({ user: { id: "byok-user" } } as any);

			await expect(actions.default(event)).rejects.toMatchObject({ status: 302, location: "/verify?pending=1" });

			expect(mockVerifyApiKey).toHaveBeenCalledWith("https://api.example.com/v1", "sk-test", "test-model");
			expect(mockEncryptApiKey).toHaveBeenCalledWith("sk-test");
		});

		it("blocks signup when BYOK verification fails", async () => {
			const event = createEvent({
				email: "badbyok@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "en",
				apiKey: "sk-bad",
				apiBaseUrl: "https://api.example.com/v1",
				apiModel: "test-model",
			});

			mockVerifyApiKey.mockResolvedValue({ ok: false, error: "HTTP 401: Invalid Key" });

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("API key verification failed");
			expect(auth.api.signUpEmail).not.toHaveBeenCalled();
		});

		it("skips BYOK verification when no apiKey provided", async () => {
			const event = createEvent({
				email: "nobyok@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "en",
			});

			vi.mocked(auth.api.signUpEmail).mockResolvedValueOnce({ user: { id: "nobyok-user" } } as any);

			await expect(actions.default(event)).rejects.toMatchObject({ status: 302, location: "/verify?pending=1" });

			expect(mockVerifyApiKey).not.toHaveBeenCalled();
		});

		it("returns schema error when apiKey given without baseUrl", async () => {
			const event = createEvent({
				email: "partial@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "en",
				apiKey: "sk-key",
			});

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.apiKey).toBeDefined();
			expect(auth.api.signUpEmail).not.toHaveBeenCalled();
			expect(mockVerifyApiKey).not.toHaveBeenCalled();
		});

		it("returns schema error when baseUrl and model given without apiKey", async () => {
			const event = createEvent({
				email: "partial2@example.com",
				name: "Test User",
				password: "securePassword123!",
				activeLanguage: "en",
				apiBaseUrl: "https://api.example.com/v1",
				apiModel: "test-model",
			});

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.apiKey).toBeDefined();
			expect(auth.api.signUpEmail).not.toHaveBeenCalled();
		});
	});
});
