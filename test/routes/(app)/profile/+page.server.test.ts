import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BYOK_API_BASE_URLS, BYOK_API_KEY_MAX_LENGTH, BYOK_MODEL_MAX_LENGTH, USER_NAME_MAX_LENGTH } from "$lib/constants";
import { auth } from "$lib/server/auth/auth";
import { actions, load } from "$routes/(app)/profile/+page.server";
import { createActionEvent } from "../action-test-helpers";

const { mockFindFirst, mockFindLearningProfile, mockInsert, mockDelete, mockWhere, mockValues, mockOnConflictDoUpdate } = vi.hoisted(() => {
	const mockFindFirst = vi.fn().mockResolvedValue(undefined);
	const mockFindLearningProfile = vi.fn().mockResolvedValue(undefined);
	const mockOnConflictDoUpdate = vi.fn();
	const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	const mockWhere = vi.fn();
	const mockDelete = vi.fn(() => ({ where: mockWhere }));
	return { mockFindFirst, mockFindLearningProfile, mockInsert, mockDelete, mockWhere, mockValues, mockOnConflictDoUpdate };
});

vi.mock("$lib/server/auth/auth", () => ({
	auth: {
		api: {
			updateUser: vi.fn(),
			signOut: vi.fn(),
		},
	},
}));

vi.mock("$lib/server/db", () => ({
	db: {
		insert: mockInsert,
		delete: mockDelete,
		query: {
			userApiKey: { findFirst: mockFindFirst },
			userLearningProfile: { findFirst: mockFindLearningProfile },
		},
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	userApiKey: { userId: Symbol("userApiKey.userId") },
	userLearningProfile: {
		userId: Symbol("userLearningProfile.userId"),
		language: Symbol("userLearningProfile.language"),
	},
}));

const { mockEncryptApiKey, mockGetTrialQuotaBalance, mockVerifyApiKey } = vi.hoisted(() => ({
	mockEncryptApiKey: vi.fn((k: string) => `encrypted:${k}`),
	mockGetTrialQuotaBalance: vi.fn(async () => ({ trialTokensLeft: 50_000, trialTokensTotal: 50_000 })),
	mockVerifyApiKey: vi.fn(async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
}));

vi.mock("$lib/server/llm", () => ({
	encryptApiKey: mockEncryptApiKey,
	verifyApiKey: mockVerifyApiKey,
}));

vi.mock("$lib/server/trial-quota", () => ({
	getTrialQuotaBalance: mockGetTrialQuotaBalance,
}));

describe("Profile +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFindFirst.mockResolvedValue(undefined);
		mockFindLearningProfile.mockResolvedValue(undefined);
	});

	// ── Load Function ──────────────────────────────────────────────────
	describe("load function", () => {
		it("returns native languages and hasApiKey", async () => {
			const event = { locals: { user: { id: "test-user", activeLanguage: "fr" } } } as any;
			const result = (await load(event)) as {
				serverNativeLanguages: any[];
				hasApiKey: boolean;
				apiBaseUrl: string;
				apiModel: string;
				levelSelfAssign: number;
			};

			expect(result.serverNativeLanguages).toBeDefined();
			expect(Array.isArray(result.serverNativeLanguages)).toBe(true);

			expect(result.hasApiKey).toBe(false);
			expect(result.apiBaseUrl).toBe("");
			expect(result.apiModel).toBe("");
			expect(result.levelSelfAssign).toBe(2);
		});

		it("returns the active language's saved self-assigned level", async () => {
			mockFindLearningProfile.mockResolvedValue({ levelSelfAssign: 3 });

			const result = (await load({ locals: { user: { id: "test-user", activeLanguage: "ja" } } } as any)) as {
				levelSelfAssign: number;
			};

			expect(result.levelSelfAssign).toBe(3);
			expect(mockFindLearningProfile).toHaveBeenCalledOnce();
		});

		it("returns saved BYOK provider and model without exposing the API key", async () => {
			mockFindFirst.mockResolvedValue({
				userId: "test-user",
				baseUrl: BYOK_API_BASE_URLS[8],
				model: "Qwen/Qwen3-8B",
			});

			const result = (await load({ locals: { user: { id: "test-user", activeLanguage: "en" } } } as any)) as {
				hasApiKey: boolean;
				apiBaseUrl: string;
				apiModel: string;
				apiKey?: string;
				encryptedKey?: string;
			};

			expect(result.hasApiKey).toBe(true);
			expect(result.apiBaseUrl).toBe(BYOK_API_BASE_URLS[8]);
			expect(result.apiModel).toBe("Qwen/Qwen3-8B");
			expect(result.apiKey).toBeUndefined();
			expect(result.encryptedKey).toBeUndefined();
		});
	});

	// ── Actions ────────────────────────────────────────────────────────
	describe("Actions", () => {
		it("updateProfile returns 400 for invalid payload", async () => {
			const result = (await actions.updateProfile(
				createActionEvent({
					name: "x".repeat(USER_NAME_MAX_LENGTH + 1),
				}),
			)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.name).toBeDefined();
			expect(auth.api.updateUser).not.toHaveBeenCalled();
		});

		it("updateProfile handles missing optional fields", async () => {
			const event = createActionEvent({});
			const result = await actions.updateProfile(event);

			// No user profile fields to update, so updateUser is not called
			expect(auth.api.updateUser).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});

		it("updateProfile calls auth update and returns success", async () => {
			const event = createActionEvent({
				name: "Alice",
				nativeLanguage: "zh",
			});

			const result = await actions.updateProfile(event);

			expect(auth.api.updateUser).toHaveBeenCalledWith({
				body: {
					name: "Alice",
					nativeLanguage: "zh",
				},
				headers: event.request.headers,
			});
			expect(result).toEqual({ success: true });
		});

		it.each([
			{ field: "feedbackLanguagePreference", value: "target" },
			{ field: "nativeLanguage", value: "fr" },
		])("updateProfile saves only the changed $field setting", async ({ field, value }) => {
			const event = createActionEvent({ [field]: value });

			const result = await actions.updateProfile(event);

			expect(auth.api.updateUser).toHaveBeenCalledWith({
				body: { [field]: value },
				headers: event.request.headers,
			});
			expect(result).toEqual({ success: true });
		});

		it("updateProfile ignores unknown fields", async () => {
			const event = createActionEvent({
				name: "Alice",
				timezone: "Europe/Paris",
			});

			const result = await actions.updateProfile(event);

			expect(auth.api.updateUser).toHaveBeenCalledWith({
				body: {
					name: "Alice",
				},
				headers: event.request.headers,
			});
			expect(result).toEqual({ success: true });
		});

		it("signOut calls auth api and redirects", async () => {
			const event = createActionEvent({});
			await expect(actions.signOut(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
			expect(auth.api.signOut).toHaveBeenCalledWith({ headers: event.request.headers });
		});

		it("upserts the self-assigned level for only the active target language", async () => {
			const event = createActionEvent({ levelSelfAssign: "1" });
			event.locals.user.activeLanguage = "es";

			const result = await actions.updateProficiency(event);

			expect(result).toEqual({ success: true, levelSelfAssign: 1 });
			expect(mockValues).toHaveBeenCalledWith({ userId: "u1", language: "es", levelSelfAssign: 1 });
			expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					target: expect.any(Array),
					set: expect.objectContaining({ levelSelfAssign: 1, updatedAt: expect.any(Date) }),
				}),
			);
		});

		it("rejects an invalid self-assigned level", async () => {
			const event = createActionEvent({ levelSelfAssign: "4" });
			event.locals.user.activeLanguage = "fr";

			const result = (await actions.updateProficiency(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(mockInsert).not.toHaveBeenCalled();
		});
	});

	// ── BYOK (Bring Your Own Key) ─────────────────────────────────────
	describe("BYOK", () => {
		it("clearApiKey deletes the user's API key row", async () => {
			const event = createActionEvent({});
			const result = await actions.clearApiKey(event);

			expect(result).toEqual({ success: true });
			expect(mockDelete).toHaveBeenCalled();
			expect(mockWhere).toHaveBeenCalled();
		});

		it("clearApiKey redirects when no user", async () => {
			const event = createActionEvent({}, "");

			await expect(actions.clearApiKey(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
			expect(mockDelete).not.toHaveBeenCalled();
		});

		it("updateProfile saves BYOK config after verification", async () => {
			const event = createActionEvent({
				apiKey: "sk-test-key",
				apiBaseUrl: BYOK_API_BASE_URLS[0],
				apiModel: "test-model",
			});

			mockVerifyApiKey.mockResolvedValue({ ok: true });

			const result = await actions.updateProfile(event);

			expect(mockVerifyApiKey).toHaveBeenCalledWith(BYOK_API_BASE_URLS[0], "sk-test-key", "test-model");
			expect(mockEncryptApiKey).toHaveBeenCalledWith("sk-test-key");
			expect(result).toEqual({ success: true });
		});

		it("updateProfile returns 400 when BYOK verification fails", async () => {
			const event = createActionEvent({
				apiKey: "sk-bad-key",
				apiBaseUrl: BYOK_API_BASE_URLS[0],
				apiModel: "test-model",
			});

			mockVerifyApiKey.mockResolvedValue({ ok: false, error: "HTTP 401: Invalid API Key" });

			const result = (await actions.updateProfile(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("API key verification failed");
			expect(mockEncryptApiKey).not.toHaveBeenCalled();
		});

		it("updateProfile returns schema error when apiKey is given without baseUrl", async () => {
			const event = createActionEvent({
				apiKey: "sk-key-only",
			});

			const result = (await actions.updateProfile(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.apiBaseUrl).toBeDefined();
			expect(result.data?.errors?.apiModel).toBeDefined();
			expect(mockVerifyApiKey).not.toHaveBeenCalled();
		});

		it("updateProfile returns schema error when baseUrl and model are given without apiKey", async () => {
			const event = createActionEvent({
				apiBaseUrl: BYOK_API_BASE_URLS[0],
				apiModel: "test-model",
			});

			const result = (await actions.updateProfile(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.apiKey).toBeDefined();
		});

		it("updateProfile rejects an unsupported BYOK base URL before verification", async () => {
			const event = createActionEvent({
				apiKey: "sk-test-key",
				apiBaseUrl: "https://api.example.com/v1",
				apiModel: "test-model",
			});

			const result = (await actions.updateProfile(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.apiBaseUrl).toBeDefined();
			expect(mockVerifyApiKey).not.toHaveBeenCalled();
			expect(mockEncryptApiKey).not.toHaveBeenCalled();
		});

		it("updateProfile rejects overlong BYOK apiKey before verification", async () => {
			const event = createActionEvent({
				apiKey: "k".repeat(BYOK_API_KEY_MAX_LENGTH + 1),
				apiBaseUrl: BYOK_API_BASE_URLS[0],
				apiModel: "test-model",
			});

			const result = (await actions.updateProfile(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.apiKey).toBeDefined();
			expect(mockVerifyApiKey).not.toHaveBeenCalled();
			expect(mockEncryptApiKey).not.toHaveBeenCalled();
		});

		it("updateProfile rejects overlong BYOK apiModel before verification", async () => {
			const event = createActionEvent({
				apiKey: "sk-test-key",
				apiBaseUrl: BYOK_API_BASE_URLS[0],
				apiModel: "m".repeat(BYOK_MODEL_MAX_LENGTH + 1),
			});

			const result = (await actions.updateProfile(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.apiModel).toBeDefined();
			expect(mockVerifyApiKey).not.toHaveBeenCalled();
			expect(mockEncryptApiKey).not.toHaveBeenCalled();
		});
	});
});
