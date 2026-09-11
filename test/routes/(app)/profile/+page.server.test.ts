import type { ActionFailure } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BYOK_API_BASE_URLS, BYOK_API_KEY_MAX_LENGTH, BYOK_MODEL_MAX_LENGTH, USER_NAME_MAX_LENGTH } from "$lib/constants";
import { auth } from "$lib/server/auth/auth";
import { actions, load } from "$routes/(app)/profile/+page.server";
import { createActionEvent } from "../action-test-helpers";

/** Interpolated values of a drizzle `sql` fragment; literal SQL chunks and mocked column references (symbols) are skipped. */
const sqlParams = (fragment: any): unknown[] =>
	fragment.queryChunks.filter((chunk: unknown) => typeof chunk === "string" || typeof chunk === "number");

const { mockFindFirst, mockFindUser, mockInsert, mockUpdate, mockSet, mockUpdateWhere, mockDelete, mockWhere } = vi.hoisted(() => {
	const mockFindFirst = vi.fn().mockResolvedValue(undefined);
	const mockFindUser = vi.fn().mockResolvedValue(undefined);
	const mockOnConflictDoUpdate = vi.fn();
	const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	const mockUpdateWhere = vi.fn();
	const mockSet = vi.fn((_values: Record<string, unknown>) => ({ where: mockUpdateWhere }));
	const mockUpdate = vi.fn(() => ({ set: mockSet }));
	const mockWhere = vi.fn();
	const mockDelete = vi.fn(() => ({ where: mockWhere }));
	return {
		mockFindFirst,
		mockFindUser,
		mockInsert,
		mockUpdate,
		mockSet,
		mockUpdateWhere,
		mockDelete,
		mockWhere,
		mockValues,
		mockOnConflictDoUpdate,
	};
});

vi.mock("$lib/server/auth/auth", () => ({
	auth: {
		api: {
			updateUser: vi.fn(),
			signOut: vi.fn(),
			listUserAccounts: vi.fn(),
			linkSocialAccount: vi.fn(),
			unlinkAccount: vi.fn(),
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

vi.mock("$lib/server/db", () => ({
	db: {
		insert: mockInsert,
		update: mockUpdate,
		delete: mockDelete,
		query: {
			userApiKey: { findFirst: mockFindFirst },
			user: { findFirst: mockFindUser },
		},
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	userApiKey: { userId: Symbol("userApiKey.userId") },
	user: {
		id: Symbol("user.id"),
		levelSelfAssign: Symbol("user.levelSelfAssign"),
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
		mockFindUser.mockResolvedValue(undefined);
		vi.mocked(auth.api.listUserAccounts).mockResolvedValue([
			{ id: "credential-account", providerId: "credential", accountId: "test-user", userId: "test-user" },
		] as never);
	});

	const createLoadEvent = (activeLanguage: string, query = "") =>
		({
			locals: { user: { id: "test-user", activeLanguage } },
			request: { headers: new Headers() },
			url: new URL(`https://example.com/profile${query}`),
		}) as any;

	// ── Load Function ──────────────────────────────────────────────────
	describe("load function", () => {
		it("returns native languages and hasApiKey", async () => {
			const event = createLoadEvent("fr");
			const result = (await load(event)) as {
				serverNativeLanguages: any[];
				hasApiKey: boolean;
				apiBaseUrl: string;
				apiModel: string;
				levelSelfAssign: number;
			};

			expect(result.serverNativeLanguages).toBeDefined();
			expect(Array.isArray(result.serverNativeLanguages)).toBe(true);
			expect(result.serverNativeLanguages.find((option) => option.value === "en")?.label).toBe("anglais");

			expect(result.hasApiKey).toBe(false);
			expect(result.apiBaseUrl).toBe("");
			expect(result.apiModel).toBe("");
			expect(result.levelSelfAssign).toBe(2);
		});

		it("returns the active language's saved self-assigned level", async () => {
			mockFindUser.mockResolvedValue({ levelSelfAssign: { en: 2, es: 1, fr: 3, ja: 3 } });

			const result = (await load(createLoadEvent("ja"))) as {
				levelSelfAssign: number;
			};

			expect(result.levelSelfAssign).toBe(3);
			expect(mockFindUser).toHaveBeenCalledOnce();
		});

		it("returns saved BYOK provider and model without exposing the API key", async () => {
			mockFindFirst.mockResolvedValue({
				userId: "test-user",
				baseUrl: BYOK_API_BASE_URLS[8],
				model: "Qwen/Qwen3-8B",
			});

			const result = (await load(createLoadEvent("en"))) as {
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

		it("returns connected and available login methods", async () => {
			vi.mocked(auth.api.listUserAccounts).mockResolvedValue([
				{ id: "credential-account", providerId: "credential", createdAt: new Date("2026-03-14T09:00:00.000Z") },
				{ id: "github-account", providerId: "github", createdAt: new Date("2026-04-02T12:30:00.000Z") },
			] as never);

			const result = (await load(createLoadEvent("fr", "?linked=github"))) as any;

			expect(result.credentialConnected).toBe(true);
			expect(result.loginMethodCount).toBe(2);
			expect(result.socialLoginMethods).toEqual([
				{ id: "google", label: "Google", configured: true, connected: false, connectedAt: null },
				// Provider accounts may carry an address the Libiamo account does not,
				// so the page needs something beyond "Connected" to tell them apart.
				{ id: "github", label: "GitHub", configured: true, connected: true, connectedAt: "2026-04-02T12:30:00.000Z" },
			]);
			expect(result.accountResult).toBe("connected");
			expect(result.accountFailure).toBeNull();
			expect(auth.api.listUserAccounts).toHaveBeenCalledWith({ headers: expect.any(Headers) });
		});

		// The value said why the link was refused; reducing it to a boolean is what left
		// every distinct failure sharing one "please try again".
		it("classifies the reason an OAuth link came back rejected", async () => {
			vi.mocked(auth.api.listUserAccounts).mockResolvedValue([{ id: "credential-account", providerId: "credential" }] as never);

			const result = (await load(createLoadEvent("fr", "?error=account_already_linked_to_different_user"))) as any;

			expect(result.accountFailure).toBe("already-linked-elsewhere");
			expect(result.accountResult).toBeNull();
		});
	});

	// ── Actions ────────────────────────────────────────────────────────
	describe("Actions", () => {
		it("starts the official provider-linking flow", async () => {
			const event = createActionEvent({ provider: "google" });
			vi.mocked(auth.api.linkSocialAccount).mockResolvedValue({
				url: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
				redirect: false,
			} as never);

			await expect(actions.linkSocialAccount(event)).rejects.toMatchObject({
				status: 303,
				location: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
			});
			expect(auth.api.linkSocialAccount).toHaveBeenCalledWith({
				body: {
					provider: "google",
					callbackURL: "/profile?linked=google",
					errorCallbackURL: "/profile",
					disableRedirect: true,
				},
				headers: event.request.headers,
			});
		});

		it("disconnects a provider through Better Auth", async () => {
			const event = createActionEvent({ provider: "github" });

			await expect(actions.unlinkSocialAccount(event)).resolves.toEqual({ accountResult: "disconnected" });
			expect(auth.api.unlinkAccount).toHaveBeenCalledWith({
				body: { providerId: "github" },
				headers: event.request.headers,
			});
		});

		it("refuses to start a second link for an already connected provider", async () => {
			vi.mocked(auth.api.listUserAccounts).mockResolvedValue([
				{ id: "credential-account", providerId: "credential" },
				{ id: "google-account", providerId: "google" },
			] as never);

			const result = (await actions.linkSocialAccount(createActionEvent({ provider: "google" }))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.accountResult).toBe("error");
			expect(auth.api.linkSocialAccount).not.toHaveBeenCalled();
		});

		it("rejects unsupported provider account actions", async () => {
			const result = (await actions.linkSocialAccount(createActionEvent({ provider: "microsoft" }))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.accountResult).toBe("error");
			expect(auth.api.linkSocialAccount).not.toHaveBeenCalled();
		});

		// Better Auth guards `/unlink-account` with a freshness check against
		// `session.createdAt`, which session renewal never advances. Reporting that
		// as a generic "please try again" leaves the user retrying forever.
		it("tells the user to sign in again when the session is not fresh enough to unlink", async () => {
			vi.mocked(auth.api.unlinkAccount).mockRejectedValueOnce(
				new APIError("FORBIDDEN", { code: "SESSION_NOT_FRESH", message: "Session is not fresh" }),
			);

			const result = (await actions.unlinkSocialAccount(createActionEvent({ provider: "github" }))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.accountResult).toBe("stale-session");
		});

		it("reports other Better Auth unlink failures as a generic error", async () => {
			vi.mocked(auth.api.unlinkAccount).mockRejectedValueOnce(
				new APIError("BAD_REQUEST", { code: "FAILED_TO_UNLINK_LAST_ACCOUNT", message: "You cannot unlink your last login method" }),
			);

			const result = (await actions.unlinkSocialAccount(createActionEvent({ provider: "github" }))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.accountResult).toBe("error");
		});

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

		it("patches the self-assigned level for only the active target language", async () => {
			const event = createActionEvent({ levelSelfAssign: "1" });
			event.locals.user.activeLanguage = "es";

			const result = await actions.updateProficiency(event);

			expect(result).toEqual({ success: true, levelSelfAssign: 1 });
			expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ levelSelfAssign: expect.anything(), updatedAt: expect.any(Date) }));
			// The jsonb_set patch must be bound to the active language and the chosen level only.
			const params = sqlParams(mockSet.mock.calls[0]?.[0].levelSelfAssign);
			expect(params).toEqual(["es", 1]);
			expect(mockUpdateWhere).toHaveBeenCalledOnce();
		});

		it("rejects an invalid self-assigned level", async () => {
			const event = createActionEvent({ levelSelfAssign: "4" });
			event.locals.user.activeLanguage = "fr";

			const result = (await actions.updateProficiency(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(mockUpdate).not.toHaveBeenCalled();
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
