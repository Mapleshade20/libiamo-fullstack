import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import TemplateForm from "$lib/components/TemplateForm.svelte";

const commonTemplate = {
	language: "fr",
	cadence: "none",
	difficulty: 2,
	pointReward: 10,
	gemReward: 5,
	titleBase: "A letter",
	descriptionBase: "Translate a personal letter.",
};

describe("TemplateForm", () => {
	it("omits unsupported controls for translation templates", () => {
		const { body } = render(TemplateForm, {
			props: {
				template: {
					...commonTemplate,
					interactionType: "translate",
					ui: "translator",
					agentPromptBase: "a letter to a close friend",
					translationReference: ["Bonjour."],
				},
			},
		});

		expect(body).not.toContain('name="shortObjectiveBase"');
		expect(body).not.toContain('name="materialsMd"');
	});

	it("keeps the controls available for ordinary templates", () => {
		const { body } = render(TemplateForm, {
			props: {
				template: {
					...commonTemplate,
					interactionType: "chat",
					ui: "imessage",
				},
			},
		});

		expect(body).toContain('name="shortObjectiveBase"');
		expect(body).toContain('name="materialsMd"');
	});
});
