import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BYOK_API_BASE_URLS } from "$lib/constants";
import { auth } from "$lib/server/auth";
import { actions, load } from "$routes/(app)/profile/+page.server";
import { createActionEvent, runSwitchLanguageActionSuite } from "../action-test-helpers";

const { mockOnConflictDoNothing, mockValues, mockInsert, mockDelete, mockWhere } = vi.hoisted(() => {
	const mockOnConflictDoNothing = vi.fn();
	const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing, onConflictDoUpdate: vi.fn() }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	const mockWhere = vi.fn();
	const mockDelete = vi.fn(() => ({ where: mockWhere }));
	return { mockOnConflictDoNothing, mockValues, mockInsert, mockDelete, mockWhere };
});

vi.mock("$lib/server/auth", () => ({
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
		query: { userApiKey: { findFirst: vi.fn().mockResolvedValue(undefined) } },
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	userLearningProfile: Symbol("userLearningProfile"),
	userApiKey: { userId: Symbol("userApiKey.userId") },
}));

const { mockEncryptApiKey, mockVerifyApiKey } = vi.hoisted(() => ({
	mockEncryptApiKey: vi.fn((k: string) => `encrypted:${k}`),
	mockVerifyApiKey: vi.fn(async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
}));

vi.mock("$lib/server/api-key-crypto", () => ({
	encryptApiKey: mockEncryptApiKey,
	verifyApiKey: mockVerifyApiKey,
}));

describe("Profile +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Load Function ──────────────────────────────────────────────────
	describe("load function", () => {
		it("returns serverTimezones and hasApiKey", async () => {
			const event = { locals: { user: { id: "test-user" } } } as any;
			const result = (await load(event)) as { serverTimezones: any[]; hasApiKey: boolean };

			expect(result.serverTimezones).toBeDefined();
			expect(Array.isArray(result.serverTimezones)).toBe(true);

			expect(result.hasApiKey).toBe(false);

			if (result.serverTimezones.length > 0) {
				expect(result.serverTimezones[0]).toHaveProperty("value");
				expect(result.serverTimezones[0]).toHaveProperty("label");
			}
		});
	});

	// ── Actions ────────────────────────────────────────────────────────
	describe("Actions", () => {
		it("updateProfile returns 400 for invalid payload", async () => {
			const result = (await actions.updateProfile(
				createActionEvent({
					name: "x".repeat(60),
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
				timezone: "Asia/Shanghai",
				nativeLanguage: "zh",
			});

			const result = await actions.updateProfile(event);

			expect(auth.api.updateUser).toHaveBeenCalledWith({
				body: {
					name: "Alice",
					timezone: "Asia/Shanghai",
					nativeLanguage: "zh",
				},
				headers: event.request.headers,
			});
			expect(result).toEqual({ success: true });
		});

		it("updateProfile normalizes blank timezone to undefined", async () => {
			const event = createActionEvent({
				name: "Alice",
				timezone: "",
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

		runSwitchLanguageActionSuite({
			action: actions.switchLanguage,
			updateUser: auth.api.updateUser as any,
			mockInsert,
			mockValues,
			mockOnConflictDoNothing,
			successLanguage: "fr",
		});

		it("signOut calls auth api and redirects", async () => {
			const event = createActionEvent({});
			await expect(actions.signOut(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
			expect(auth.api.signOut).toHaveBeenCalledWith({ headers: event.request.headers });
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
			expect(result.data?.errors?.apiKey).toBeDefined();
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
	});
});
