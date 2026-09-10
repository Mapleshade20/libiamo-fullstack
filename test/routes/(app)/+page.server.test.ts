import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth/auth";
import { loadQuestHallData } from "$lib/server/quest-hall";
import { actions, load } from "$routes/(app)/+page.server";
import { hallData } from "../../fixtures/quest-hall";
import { runSwitchLanguageActionSuite } from "./action-test-helpers";

vi.mock("$lib/server/auth/auth", () => ({ auth: { api: { updateUser: vi.fn() } } }));
vi.mock("$lib/server/browser-timezone", () => ({ getBrowserTimezone: vi.fn(() => "UTC") }));
vi.mock("$lib/server/quest-hall", () => ({ loadQuestHallData: vi.fn(async () => hallData()) }));

describe("Quest Hall routing", () => {
	beforeEach(() => vi.clearAllMocks());
	it("authenticates before loading the catalog", async () => {
		await expect(load({ locals: { user: null } } as any)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
		expect(loadQuestHallData).not.toHaveBeenCalled();
	});
	it.each([
		["daily-7", "/task/7"],
		["weekly-9", "/task/9"],
		["translation-22", "/translate/22"],
	])("redirects legacy %s without catalog membership checks", async (key, location) => {
		await expect(
			load({ locals: { user: { id: "u1" } }, url: new URL(`https://libiamo.test/?view=prepare&task=${key}`) } as any),
		).rejects.toMatchObject({ status: 308, location });
		expect(loadQuestHallData).not.toHaveBeenCalled();
	});
	it.each(["2026", "1900"])("validates catalog year %s and clamps the page", async (year) => {
		const result = (await load({
			locals: { user: { id: "u1" } },
			cookies: {},
			url: new URL(`https://libiamo.test/?view=catalog&section=translation&leaf=999&year=${year}`),
		} as any)) as any;
		expect(result.translationMonth).toBe(year === "2026" ? "2026-01" : "2026-09");
		expect(result.hallLocation).toMatchObject({ view: "catalog", section: "translation", task: null });
		expect(result.hallLocation.leaf).toBeLessThan(999);
		expect(loadQuestHallData).toHaveBeenCalledWith({ id: "u1" }, "UTC");
	});
	runSwitchLanguageActionSuite({ action: actions.switchLanguage, updateUser: auth.api.updateUser as any, successLanguage: "ja" });
});
