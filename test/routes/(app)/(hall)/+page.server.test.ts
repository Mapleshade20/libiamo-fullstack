import type { ActionFailure } from "@sveltejs/kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth/auth";
import { actions } from "$routes/(app)/(hall)/+page.server";
import { createActionEvent, runSwitchLanguageActionSuite } from "../action-test-helpers";

const { env } = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));

vi.mock("$env/dynamic/private", () => ({ env }));
vi.mock("$lib/server/auth/auth", () => ({ auth: { api: { updateUser: vi.fn() } } }));

describe("Quest Hall actions", () => {
	runSwitchLanguageActionSuite({ action: actions.switchLanguage, updateUser: auth.api.updateUser as any, successLanguage: "ja" });

	afterEach(() => {
		env.DISABLED_LANGUAGES = undefined;
	});

	it("refuses a language that is opening soon", async () => {
		vi.clearAllMocks();
		env.DISABLED_LANGUAGES = "ja";
		const result = (await actions.switchLanguage(createActionEvent({ language: "ja" }, "user-1"))) as ActionFailure<any>;

		expect(result.status).toBe(400);
		expect(auth.api.updateUser).not.toHaveBeenCalled();
	});
});
