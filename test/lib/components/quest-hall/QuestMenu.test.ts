import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import QuestMenu from "$lib/components/quest-hall/quest-menu/QuestMenu.svelte";
import type { HallQuest } from "$lib/quest-hall";
import type { HallLocation } from "$lib/quest-hall/navigation";
import type { HallData } from "$lib/server/quest-hall";

function quest(id: number, overrides: Partial<HallQuest> = {}): HallQuest {
	return {
		id,
		title: `Quest ${id}`,
		shortObjective: `Objective ${id}`,
		templateUi: "imessage",
		templateDifficulty: 2,
		templateInteractionType: "chat",
		pointReward: 10,
		sessionStatus: null,
		unreadCount: 0,
		hasUnreadReply: false,
		...overrides,
	};
}

function hallData(overrides: Partial<HallData> = {}): HallData {
	return {
		activeLanguage: "en",
		nativeLanguage: "fr",
		localDate: "2026-09-04",
		localMonday: "2026-08-31",
		editionDate: "2026-09-04",
		translationMonth: "2026-09",
		greeting: "Good morning, Fedor",
		subtitle: "A few thoughtful missions are waiting.",
		dailyTasks: [quest(1, { unreadCount: 2, hasUnreadReply: true })],
		weeklyTasks: [quest(11)],
		translationTasks: [
			{ id: 21, titleBase: "Current letter", descriptionBase: "Translate a short letter.", difficulty: 1, createdMonth: "2026-09" },
			{ id: 22, titleBase: "Archived letter", descriptionBase: null, difficulty: 2, createdMonth: "2026-08" },
		],
		translationStatusMap: {},
		...overrides,
	};
}

const home: HallLocation = { view: "home", section: "daily", leaf: 1, task: null };

describe("QuestMenu", () => {
	it("server-renders the personalized home, recommendations, ribbons, and canonical links", () => {
		const { body } = render(QuestMenu, { props: { data: hallData(), initialLocation: home, accountScope: "account-a", lang: "en" } });

		expect(body).toContain("Good morning, Fedor");
		expect(body).toContain("Recommended");
		expect(body).toContain("Open menu");
		expect(body).toContain("Menu sections");
		expect(body).toContain(">MENU</strong>");
		expect(body).toContain('href="/task/1"');
		expect(body).toContain(">2</span>");
	});

	it("shows an exact accessible inbox total and caps the compact cover badge at nine", () => {
		const { body } = render(QuestMenu, {
			props: {
				data: hallData({ dailyTasks: [quest(1, { unreadCount: 10, hasUnreadReply: true })] }),
				initialLocation: home,
				accountScope: "account-a",
				lang: "en",
			},
		});

		expect(body).toContain("Replies: 10 unread replies");
		expect(body).toContain(">9+</span>");
	});

	it.each([
		["en", "MENU"],
		["es", "CARTA"],
		["fr", "CARTE"],
		["ja", "メニュー"],
	] as const)("server-renders the localized menu title for %s", (lang, title) => {
		const { body } = render(QuestMenu, {
			props: { data: hallData({ activeLanguage: lang }), initialLocation: home, accountScope: "account-a", lang },
		});

		expect(body).toContain(`>${title}</strong>`);
	});

	it("keeps the left page on the hinged cover and renders the book depth surfaces", () => {
		const { body } = render(QuestMenu, { props: { data: hallData(), initialLocation: home, accountScope: "account-a", lang: "en" } });

		expect(body).toContain('class="cover-face cover-face-back page page-left ');
		expect(body).toContain('class="book-surface book-deck book-deck-blank ');
		expect(body).toContain('class="book-edge book-edge-board book-edge-spine ');
		expect(body).toContain("Today · 01");
	});

	it("server-renders a direct catalog location with localized month controls and current-month production items", () => {
		const { body } = render(QuestMenu, {
			props: {
				data: hallData(),
				initialLocation: { view: "catalog", section: "translation", leaf: 1, task: null },
				accountScope: "account-a",
				lang: "en",
			},
		});

		expect(body).toContain("Choose a mission");
		expect(body).toContain("Current letter");
		expect(body).toContain('href="/translate/21"');
		expect(body).toContain('aria-label="Previous month"');
		expect(body).toContain('aria-label="Next month"');
		expect(body).toContain("September 2026");
		expect(body).not.toContain("Archived letter");
	});

	it("server-renders an older translation preparation with its matching month", () => {
		const data = hallData();
		const { body } = render(QuestMenu, {
			props: {
				data,
				initialLocation: { view: "prepare", section: "translation", leaf: 1, task: "translation-22" },
				accountScope: "account-a",
				initialPreparation: {
					kind: "translation",
					key: "translation-22",
					data: {
						template: {
							id: 22,
							title: "Archived letter",
							description: null,
							language: "en",
							translationReference: ["Reference"],
							context: "A letter",
							difficulty: 2,
							estimatedWords: null,
							pointReward: 3,
							gemReward: 30,
						},
						attempt: null,
						blockedReason: null,
					},
				},
				lang: "en",
			},
		});

		expect(body).toContain("Archived letter");
		expect(body).toContain("August 2026");
	});

	it("keeps empty production sections navigable", () => {
		const { body } = render(QuestMenu, {
			props: {
				data: hallData({ dailyTasks: [], weeklyTasks: [], translationTasks: [] }),
				initialLocation: home,
				accountScope: "account-a",
				lang: "en",
			},
		});

		expect(body).toContain("Everything is complete for this edition.");
		expect(body).toContain("No quests available yet.");
	});

	it("server-renders a directly selected quest in the preparation pane", () => {
		const data = hallData();
		const { body } = render(QuestMenu, {
			props: {
				data,
				initialLocation: { view: "prepare", section: "daily", leaf: 1, task: "daily-1" },
				accountScope: "account-a",
				initialPreparation: {
					kind: "quest",
					key: "daily-1",
					data: {
						nativeLanguage: "fr",
						task: {
							id: 1,
							title: "Prepared quest",
							description: "Detailed briefing",
							objectives: ["Reply naturally"],
							language: "en",
							templateInteractionType: "chat",
							templateUi: "imessage",
							templateDifficulty: 2,
							materialsMd: null,
							pointReward: 10,
							sessionStatus: null,
						},
					},
				},
				lang: "en",
			},
		});

		expect(body).toContain("Prepared quest");
		expect(body).toContain("Detailed briefing");
		expect(body).toContain('href="/task/1/session"');
	});
});
