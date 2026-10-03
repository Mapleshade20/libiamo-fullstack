import { describe, expect, it } from "vitest";
import { load } from "$routes/(app)/(hall)/task/[id]/+page";
import { hallData, quest } from "../../../../../fixtures/quest-hall";

describe("Task detail page", () => {
	it("opens the layout's book on the task's details without reloading it", async () => {
		const hall = hallData({ weeklyTasks: [quest(13)] });
		const data = { task: { id: 13, title: "Weekly" }, nativeLanguage: "en" };
		const result = (await load({
			data: { preparation: { kind: "quest", key: "daily-13", data } },
			parent: async () => ({ hall }),
		} as any)) as any;

		expect(result).toMatchObject({ kind: "quest", task: data.task });
		expect(result.questMenu.hall).toBe(hall);
		expect(result.questMenu.hallLocation).toMatchObject({ view: "prepare", section: "weekly", task: "weekly-13" });
		expect(result.questMenu.initialPreparation).toEqual({ kind: "quest", key: "weekly-13", data });
	});
});
