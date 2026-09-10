import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import QuestMenuRoute from "$lib/components/quest-hall/QuestMenuRoute.svelte";
import { questHallDetails } from "$lib/server/quest-hall-details";
import { hallData } from "../../../../fixtures/quest-hall";

const data = {
	displayClock: { now: 1788480000000, timeZone: "UTC" },
	accountScope: "account-a",
	questHallEdition: "2026-09-04",
	user: {
		name: "Alice",
		email: "alice@example.com",
		role: "learner",
		activeLanguage: "fr",
		nativeLanguage: "en",
		feedbackLanguagePreference: "native",
	},
	avatarUrl: "https://example.com/avatar.png",
	hasApiKey: false,
	trialQuota: null,
	template: {
		id: 12,
		title: "A letter",
		description: "Translate a personal letter.",
		language: "fr" as const,
		translationReference: ["Bonjour."],
		context: "a letter to a close friend",
		difficulty: 2,
		estimatedWords: 80,
		pointReward: 10,
		gemReward: 5,
		shortObjectiveBase: "This must not be displayed.",
		materialsMd: "# This must not be displayed",
	},
	blockedReason: null,
	attempt: null,
};

describe("translation detail page", () => {
	it("server-renders the canonical detail in the catalog-side preparation shell", () => {
		const { body } = render(QuestMenuRoute, {
			props: {
				route: questHallDetails(hallData({ activeLanguage: "fr" }), { kind: "translation", key: "translation-12", data }),
				form: null,
			},
		});

		expect(body).toContain('data-view="prepare"');
		expect(body).toContain("preparation-dock");
		expect(body).not.toContain("task-stagger");
		expect(body).toContain("A letter");
		expect(body).toContain("Translate a personal letter.");
		expect(body).not.toContain("This must not be displayed");
		expect(body).not.toContain("Background Material");
	});
});
