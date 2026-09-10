import { describe, expect, it } from "vitest";
import type { QuestHallPreparation } from "$lib/quest-hall/preparation";
import { questHallDetails } from "$lib/server/quest-hall-details";
import { hallData, quest } from "../../fixtures/quest-hall";

function taskData(id: number) {
	return {
		nativeLanguage: "fr",
		task: {
			id,
			title: "Task",
			description: null,
			objectives: [],
			language: "en" as const,
			templateInteractionType: "chat",
			templateUi: "imessage",
			templateDifficulty: 1,
			materialsMd: null,
			pointReward: 1,
			sessionStatus: null,
		},
	};
}

describe("canonical detail catalog context", () => {
	it("locates a current task on its actual catalog leaf", () => {
		const hall = hallData({ weeklyTasks: [quest(10), quest(11), quest(12), quest(13)] });
		const preparation = { kind: "quest", key: "daily-13", data: taskData(13) } satisfies QuestHallPreparation;
		const result = questHallDetails(hall, preparation);
		expect(result.hallLocation).toEqual({ view: "prepare", section: "weekly", leaf: 2, task: "weekly-13" });
		expect(result.initialPreparation).toEqual({ ...preparation, key: "weekly-13" });
	});

	it("keeps historical task details even when today's catalog is empty", () => {
		const hall = hallData({ dailyTasks: [], weeklyTasks: [] });
		const preparation = { kind: "quest", key: "daily-999", data: taskData(999) } satisfies QuestHallPreparation;
		const result = questHallDetails(hall, preparation);
		expect(result.hallLocation).toEqual({ view: "prepare", section: "daily", leaf: 1, task: "daily-999" });
		expect(result.initialPreparation.data).toBe(preparation.data);
	});

	it("locates an older-year translation independently of the default catalog year", () => {
		const hall = hallData({ translationTasks: [{ id: 3, titleBase: "Old letter", descriptionBase: null, difficulty: 1, createdMonth: "2024-03" }] });
		const preparation = {
			kind: "translation",
			key: "translation-3",
			data: {
				template: {
					id: 3,
					title: "Old letter",
					description: null,
					language: "en",
					translationReference: ["Hello"],
					context: "Letter",
					difficulty: 1,
					estimatedWords: 10,
					pointReward: 1,
					gemReward: 1,
				},
				blockedReason: null,
				attempt: null,
			},
		} satisfies QuestHallPreparation;
		const result = questHallDetails(hall, preparation);
		expect(result.hallLocation).toEqual({ view: "prepare", section: "translation", leaf: 1, task: "translation-3" });
		expect(result.initialPreparation).toEqual(preparation);
	});
});
