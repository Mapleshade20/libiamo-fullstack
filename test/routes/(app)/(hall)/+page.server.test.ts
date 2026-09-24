import { describe, vi } from "vitest";
import { auth } from "$lib/server/auth/auth";
import { actions } from "$routes/(app)/(hall)/+page.server";
import { runSwitchLanguageActionSuite } from "../action-test-helpers";

vi.mock("$lib/server/auth/auth", () => ({ auth: { api: { updateUser: vi.fn() } } }));

describe("Quest Hall actions", () => {
	runSwitchLanguageActionSuite({ action: actions.switchLanguage, updateUser: auth.api.updateUser as any, successLanguage: "ja" });
});
