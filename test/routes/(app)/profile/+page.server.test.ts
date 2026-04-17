import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth";
import { actions } from "$routes/(app)/profile/+page.server";
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

describe("Profile +page.server actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

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
