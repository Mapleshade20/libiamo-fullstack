import { render } from "svelte/server";
import { expect, it } from "vitest";
import DraftPage from "$routes/(app)/translate/[id]/attempt/+page.svelte";

it("renders the server-selected candidate and saved answer before storage restoration", () => {
	const { body } = render(DraftPage, {
		props: {
			form: null,
			data: {
				user: { activeLanguage: "en" },
				template: { id: 12, title: "A letter", language: "fr" },
				attempt: {
					id: 21,
					promptLanguage: "en",
					candidates: [["Original prompt", "Chosen prompt"]],
					answers: [{ paragraphIndex: 0, candidateIndex: 1, translation: "Bonjour mon ami." }],
				},
			} as any,
		},
	});
	expect(body).toContain("Chosen prompt");
	expect(body).toMatch(/<textarea[^>]*>Bonjour mon ami\.<\/textarea>/);
});
