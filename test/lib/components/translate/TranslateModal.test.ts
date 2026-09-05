import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import TranslateModal from "$lib/components/translate/TranslateModal.svelte";

describe("TranslateModal", () => {
	it("localizes its visible controls and accessible labels", () => {
		const { body } = render(TranslateModal, {
			props: {
				show: true,
				taskTitle: "Réserver une table",
				taskDescription: "Appelez le restaurant.",
				taskObjectives: ["Réserver poliment"],
				taskUi: "mail",
				taskInteractionType: "chat",
				nativeLanguage: "fr",
				targetLanguage: "en",
				onclose: () => undefined,
			},
		});

		expect(body).toContain('aria-label="Fermer les expressions utiles"');
		expect(body).not.toContain('aria-label="Close dialog"');
	});
});
