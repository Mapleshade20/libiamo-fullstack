import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import TranslationPreparation from "$lib/components/translation/TranslationPreparation.svelte";

const task = {
	id: 17,
	title: "Répondre à une invitation",
	description: "Traduisez une réponse polie et naturelle.",
	difficulty: 2,
	estimatedWords: 80,
};

describe("TranslationPreparation", () => {
	it("uses canonical detail actions when embedded in another route", () => {
		const { body } = render(TranslationPreparation, {
			props: {
				task,
				attempt: null,
				blockedReason: null,
				lang: "fr",
			},
		});

		expect(body).toContain("Répondre à une invitation");
		expect(body).toContain('<h2 id="translation-preparation-title"');
		expect(body).toContain('action="/task/17?/start"');
	});

	it("keeps an existing evaluation on its canonical continuation and retake paths", () => {
		const { body } = render(TranslationPreparation, {
			props: {
				task,
				attempt: { workflowPhase: "evaluating" },
				blockedReason: null,
				lang: "fr",
			},
		});

		expect(body).toContain('href="/task/17/translation/feedback"');
		expect(body).toContain('action="/task/17?/retake"');
		expect(body).toContain('<h2 id="translation-preparation-title"');
	});

	it("keeps an Archive pin on the workflow link and on both forms", () => {
		const props = { task, blockedReason: null, lang: "fr" as const, pin: "?lineup=12&attempt=7" };
		const finished = render(TranslationPreparation, { props: { ...props, attempt: { workflowPhase: "completed" } } });
		expect(finished.body).toContain('href="/task/17/translation/feedback?lineup=12&amp;attempt=7"');
		expect(finished.body).toContain('action="/task/17?lineup=12&amp;attempt=7&amp;/retake"');

		const fresh = render(TranslationPreparation, { props: { ...props, attempt: null } });
		expect(fresh.body).toContain('action="/task/17?lineup=12&amp;attempt=7&amp;/start"');
	});
});
