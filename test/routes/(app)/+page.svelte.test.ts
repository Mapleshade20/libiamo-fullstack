import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import HomePage from "$routes/(app)/+page.svelte";

const data = {
	activeLanguage: "en",
	nativeLanguage: "fr",
	localDate: "2026-09-04",
	localMonday: "2026-08-31",
	editionDate: "2026-09-04",
	translationMonth: "2026-09",
	greeting: "Good morning, Fedor",
	subtitle: "Choose a quest",
	dailyTasks: [
		{
			id: 1,
			title: "Daily quest",
			shortObjective: "Practice a conversation.",
			templateUi: "imessage",
			templateDifficulty: 1,
			templateInteractionType: "chat",
			pointReward: 10,
			sessionStatus: null,
			unreadCount: 0,
			hasUnreadReply: false,
		},
	],
	weeklyTasks: [],
	translationTasks: [{ id: 21, titleBase: "Translation task", descriptionBase: null, difficulty: 1, createdMonth: "2026-09" }],
	translationStatusMap: {},
	hallLocation: { view: "home", section: "daily", leaf: 1, task: null },
} as const;

describe("production Quest Hall page", () => {
	it("mounts translation browsing inside the Quest Menu while retaining the temporary unread entry point", () => {
		const { body } = render(HomePage, { props: { data: data as any } });

		expect(body).toContain("Open menu");
		expect(body).toContain("Daily quest");
		expect(body).toContain("Translation task");
		expect(body).toContain("Unread replies");
		expect(body).not.toContain("Translation task month");
		expect(body).not.toContain('id="translation-index-title"');
	});
});
