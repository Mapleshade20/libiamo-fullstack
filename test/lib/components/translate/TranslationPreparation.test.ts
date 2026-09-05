import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import TranslationPreparation from "$lib/components/translate/TranslationPreparation.svelte";

const template = {
	id: 17,
	title: "Répondre à une invitation",
	description: "Traduisez une réponse polie et naturelle.",
	difficulty: 2,
	pointReward: 20,
	gemReward: 2,
	estimatedWords: 80,
};

describe("TranslationPreparation", () => {
	it("uses canonical detail actions when embedded in another route", () => {
		const { body } = render(TranslationPreparation, {
			props: {
				template,
				attempt: null,
				blockedReason: null,
				lang: "fr",
				mode: "pane",
			},
		});

		expect(body).toContain("Répondre à une invitation");
		expect(body).toContain('<h2 id="translation-preparation-title"');
		expect(body).not.toContain('<h1 id="translation-preparation-title"');
		expect(body).toContain('action="/translate/17?/start"');
		expect(body).toContain("Commencer la traduction");
	});

	it("keeps an existing evaluation on its canonical continuation and retake paths", () => {
		const { body } = render(TranslationPreparation, {
			props: {
				template,
				attempt: { workflowPhase: "evaluating" },
				blockedReason: null,
				lang: "fr",
			},
		});

		expect(body).toContain('href="/translate/17/feedback"');
		expect(body).toContain('action="/translate/17?/retake"');
		expect(body).toContain("Continuer l'évaluation");
		expect(body).toContain('<h1 id="translation-preparation-title"');
	});

	it("uses the prose type role for the template description", () => {
		const { body } = render(TranslationPreparation, {
			props: { template, attempt: null, blockedReason: null, lang: "fr" },
		});

		expect(body).toMatch(/<p class="[^"]*font-prose[^"]*">Traduisez une réponse/);
	});
});
