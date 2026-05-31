import type { ActionFailure } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

export function createActionEvent(entries: Record<string, string>, userId = "u1") {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.append(key, value);
	}

	return {
		locals: { user: userId ? { id: userId } : null },
		request: {
			formData: vi.fn().mockResolvedValue(formData),
			headers: new Headers(),
		},
	} as any;
}

type SwitchLanguageSuiteOptions = {
	action: (event: any) => any;
	updateUser: (...args: any[]) => unknown;
	mockInsert: { mock: { calls: unknown[] } };
	mockValues: { mock: { calls: unknown[] } };
	mockOnConflictDoNothing: { mock: { calls: unknown[] } };
	successLanguage: string;
};

export function runSwitchLanguageActionSuite({
	action,
	updateUser,
	mockInsert,
	mockValues,
	mockOnConflictDoNothing,
	successLanguage,
}: SwitchLanguageSuiteOptions) {
	describe("switchLanguage action", () => {
		it("returns 400 for invalid language", async () => {
			const result = (await action(createActionEvent({ language: "de" }))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Invalid language");
			expect(updateUser).not.toHaveBeenCalled();
		});

		it("returns 400 when language field is missing", async () => {
			const result = (await action(createActionEvent({}))) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Invalid language");
		});

		it("redirects before parsing form data when user is missing", async () => {
			const event = createActionEvent({ language: "fr" }, "");

			await expect(action(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
			expect(event.request.formData).not.toHaveBeenCalled();
			expect(updateUser).not.toHaveBeenCalled();
		});

		it("updates language, ensures profile, and redirects", async () => {
			const event = createActionEvent({ language: successLanguage }, "user-1");

			try {
				await action(event);
				expect.fail("Should have thrown a redirect");
			} catch (error: any) {
				expect(error.status).toBe(302);
				expect(error.location).toBe("/");
			}

			expect(updateUser).toHaveBeenCalledWith({
				body: { activeLanguage: successLanguage },
				headers: event.request.headers,
			});
			expect(mockInsert).toHaveBeenCalled();
			expect(mockValues).toHaveBeenCalledWith({ userId: "user-1", language: successLanguage });
			expect(mockOnConflictDoNothing).toHaveBeenCalled();
		});
	});
}
