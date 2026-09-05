import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import StudyCard from "$lib/components/review/StudyCard.svelte";

describe("StudyCard", () => {
	it("uses prose typography for study content while keeping controls functional", () => {
		const { body } = render(StudyCard, {
			props: {
				vocab: "s'épanouir",
				nativeDefinition: "to flourish",
				nativeText: "The garden flourishes in spring.",
				targetText: "Le jardin s'épanouit au printemps.",
				revealed: true,
				showAnswerLabel: "Show answer",
				counts: { new: 1, learning: 2, review: 3 },
				countLabels: { new: "New", learning: "Learning", review: "Review" },
				actions: [{ id: "good", label: "Good", shortcut: "2", tone: "good" }],
				onreveal: () => undefined,
				onaction: () => undefined,
			},
		});

		expect(body.match(/font-prose/g)).toHaveLength(4);
		expect(body).toContain("to flourish");
		expect(body).toContain(">Good<");
		expect(body).not.toContain('button type="button" class="font-prose');
	});
});
