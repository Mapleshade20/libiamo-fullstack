import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import TranslationDetailPage from "$routes/(app)/translate/[id]/+page.svelte";

const data = {
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
	it("uses the ordinary task detail shell without unsupported content", () => {
		const { body } = render(TranslationDetailPage, { props: { data, form: null } });

		expect(body).toContain("task-stagger");
		expect(body).toContain("max-w-2xl");
		expect(body).toContain("Retour à la Salle des Quêtes");
		expect(body).toContain("A letter");
		expect(body).toContain("Translate a personal letter.");
		expect(body).not.toContain("This must not be displayed");
		expect(body).not.toContain("Background Material");
	});
});
