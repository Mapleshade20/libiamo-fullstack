import { describe, expect, it } from "vitest";
import { adaptHallDataToQuestMenu } from "$lib/quest-hall/menu";
import { load } from "$routes/(app)/(hall)/+page";
import { hallData } from "../../../fixtures/quest-hall";

function event(path: string) {
	return { url: new URL(`https://libiamo.test${path}`), parent: async () => ({ hall: hallData() }) } as any;
}

describe("Quest Hall page", () => {
	it.each([
		["daily-7", "/task/7"],
		["weekly-9", "/task/9"],
		["translation-22", "/task/22"],
	])("redirects legacy %s without catalog membership checks", async (key, location) => {
		await expect(load(event(`/?view=prepare&task=${key}`))).rejects.toMatchObject({ status: 308, location });
	});

	it.each(["2026", "1900"])("validates catalog year %s and clamps the page", async (year) => {
		const { questMenu } = (await load(event(`/?view=catalog&section=translation&leaf=999&year=${year}`))) as any;
		expect(questMenu.catalogMonth).toBe(year === "2026" ? "2026-01" : "2026-09");
		// The selected year must not overwrite the real current month, which is the
		// baseline `adaptHallDataToQuestMenu` compares against to flag archived entries.
		expect(questMenu.hall.translationMonth).toBe("2026-09");
		expect(questMenu.hallLocation).toMatchObject({ view: "catalog", section: "translation", task: null });
		expect(questMenu.hallLocation.leaf).toBeLessThan(999);
		expect(questMenu.initialPreparation).toBeNull();
	});

	it("keeps past months archived when the catalog opens on the current year", async () => {
		const { questMenu } = (await load(event("/?view=catalog&section=translation&year=2026"))) as any;
		const catalog = adaptHallDataToQuestMenu(questMenu.hall, questMenu.catalogMonth, "year");
		expect(catalog.sections.translation.map((item: any) => [item.id, item.archived])).toEqual([
			[21, false],
			[22, true],
		]);
	});
});
