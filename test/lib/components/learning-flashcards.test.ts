import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";
import StudyCard from "$lib/components/review/StudyCard.svelte";
import TransferPractice from "$lib/components/translate-evaluation/TransferPractice.svelte";

describe("shared vocabulary study card", () => {
	it("reserves both target-language answers while keeping them hidden before reveal", () => {
		const { body } = render(StudyCard, {
			props: {
				vocab: "make a decision",
				nativeDefinition: "作出决定",
				nativeText: "我们今天必须作出决定。",
				targetText: "We need to make a decision today.",
				revealed: false,
				showAnswerLabel: "Show Answer",
				counts: { new: 1, learning: 2, review: 3 },
				countLabels: { new: "New", learning: "Learning", review: "Review" },
				actions: [{ id: "again", label: "Again", shortcut: "1", tone: "again" }],
				onreveal: vi.fn(),
				onaction: vi.fn(),
			},
		});
		expect(body).toContain("作出决定");
		expect(body).toContain("我们今天必须作出决定。");
		expect(body).toContain("make a decision");
		expect(body).toContain("We need to make a decision today.");
		expect(body.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
		expect(body).toContain("invisible opacity-0");
		expect(body).toContain("Show Answer");
		expect(body).toContain('aria-label="New: 1; Learning: 2; Review: 3"');
	});

	it("uses the same hidden-answer component for transfer without an answer input", () => {
		const { body } = render(TransferPractice, {
			props: {
				notes: [
					{
						id: 1,
						vocab: "make a decision",
						targetDefinition: "to choose what to do",
						nativeDefinition: "作出决定",
						queueKind: "new",
						examples: [{ nativeText: "我们今天必须作出决定。", targetText: "We need to make a decision today." }],
					},
				],
				currentIndex: 0,
				title: "Use the expression",
				revealLabel: "Reveal",
				incorrectLabel: "Incorrect",
				passLabel: "Pass",
				countLabels: { new: "New", learning: "Learning", review: "Review" },
				onincorrect: vi.fn(),
				onpass: vi.fn(),
			},
		});
		expect(body).toContain("作出决定");
		expect(body).toContain("我们今天必须作出决定。");
		expect(body).toContain("make a decision");
		expect(body).toContain("We need to make a decision today.");
		expect(body.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
		expect(body).not.toContain("textarea");
	});
});
