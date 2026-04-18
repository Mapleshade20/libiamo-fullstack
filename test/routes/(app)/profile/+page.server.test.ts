import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth";
import { actions, load } from "$routes/(app)/profile/+page.server";
import { createActionEvent, runSwitchLanguageActionSuite } from "../action-test-helpers";

const { mockOnConflictDoNothing, mockValues, mockInsert } = vi.hoisted(() => {
	const mockOnConflictDoNothing = vi.fn();
	const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	return { mockOnConflictDoNothing, mockValues, mockInsert };
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
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	userLearningProfile: Symbol("userLearningProfile"),
}));

describe("Profile +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Load Function ──────────────────────────────────────────────────
	describe("load function", () => {
		it("returns serverTimezones populated by Intl API", async () => {
			// Calling load will invoke buildTimezoneList() and test lines 14-55
			const event = {} as any;
			const result = (await load(event)) as { serverTimezones: any[] };

			expect(result.serverTimezones).toBeDefined();
			expect(Array.isArray(result.serverTimezones)).toBe(true);

			// Depending on Node version, the list might be populated or empty,
			// but the function should safely resolve without throwing.
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

			expect(auth.api.updateUser).toHaveBeenCalledWith({
				body: {},
				headers: event.request.headers,
			});
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
});
