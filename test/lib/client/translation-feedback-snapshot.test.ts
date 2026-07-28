import { describe, expect, it } from "vitest";
import {
	advanceTranslationTransferQueue,
	emptyTranslationFeedbackSnapshot,
	parseTranslationFeedbackSnapshot,
	type TranslationTransferQueueItem,
	translationFeedbackSnapshotKey,
} from "$lib/client/translation-feedback-snapshot";

describe("translation feedback snapshots", () => {
	const expected = { attemptId: 17, evaluatedAt: "2026-07-15T12:00:00.000Z", cardCount: 2 };

	it("builds a versioned, attempt-scoped initial snapshot", () => {
		const snapshot = emptyTranslationFeedbackSnapshot({ ...expected, firstDraftParagraphs: ["One", "Two"] });
		expect(translationFeedbackSnapshotKey(17)).toBe("libiamo:translation-feedback:17");
		expect(snapshot).toMatchObject({
			schemaVersion: 3,
			attemptId: 17,
			evaluatedAt: expected.evaluatedAt,
			correctionStep: "overview",
			currentCardIndex: 0,
			secondDraft: { paragraphs: ["One", "Two"], passed: false, skipped: false },
			transfer: { initialized: false, queue: [] },
		});
		expect(snapshot.cards).toHaveLength(2);
		expect(snapshot.cards[0]).not.toBe(snapshot.cards[1]);
	});

	it("round-trips a valid progress snapshot", () => {
		const snapshot = emptyTranslationFeedbackSnapshot({ ...expected, firstDraftParagraphs: ["One"] });
		snapshot.correctionStep = "cards";
		snapshot.currentCardIndex = 1;
		snapshot.cards[0] = { ...snapshot.cards[0], phase: "accepted", attemptCount: 1, acceptedAnswer: "Correct" };
		snapshot.transfer = {
			initialized: true,
			queue: [{ noteId: 8, exampleIndex: 2, queueKind: "new" }],
		};
		expect(parseTranslationFeedbackSnapshot(JSON.stringify(snapshot), expected)).toEqual(snapshot);
	});

	it("moves an incorrect Note to the tail indefinitely and removes a passed Note", () => {
		let queue: TranslationTransferQueueItem[] = [
			{ noteId: 8, exampleIndex: 0, queueKind: "new" },
			{ noteId: 9, exampleIndex: 1, queueKind: "review" },
		];
		queue = advanceTranslationTransferQueue(queue, "incorrect", 2);
		expect(queue).toEqual([
			{ noteId: 9, exampleIndex: 1, queueKind: "review" },
			{ noteId: 8, exampleIndex: 2, queueKind: "learning" },
		]);
		queue = advanceTranslationTransferQueue(queue, "pass");
		expect(queue).toEqual([{ noteId: 8, exampleIndex: 2, queueKind: "learning" }]);
		for (let index = 0; index < 10; index++) queue = advanceTranslationTransferQueue(queue, "incorrect", index % 4);
		expect(queue).toHaveLength(1);
		expect(queue[0].noteId).toBe(8);
	});

	it.each([
		["another attempt", { attemptId: 18 }],
		["another evaluation", { evaluatedAt: "2026-07-16T12:00:00.000Z" }],
		["a changed card count", { cardCount: 1 }],
	])("rejects progress from %s", (_label, override) => {
		const snapshot = emptyTranslationFeedbackSnapshot({ ...expected, firstDraftParagraphs: ["One"] });
		expect(parseTranslationFeedbackSnapshot(JSON.stringify(snapshot), { ...expected, ...override })).toBeNull();
	});

	it("rejects malformed nested correction, second-draft, and transfer state", () => {
		const snapshot = emptyTranslationFeedbackSnapshot({ ...expected, firstDraftParagraphs: ["One"] });
		const malformed = [
			{ ...snapshot, cards: [{ ...snapshot.cards[0], attemptCount: -1 }, snapshot.cards[1]] },
			{ ...snapshot, secondDraft: { ...snapshot.secondDraft, passed: "yes" } },
			{ ...snapshot, transfer: { ...snapshot.transfer, queue: [{ noteId: 0, exampleIndex: 2, queueKind: "new" }] } },
			{ ...snapshot, transfer: { ...snapshot.transfer, queue: [{ noteId: 8, exampleIndex: -1, queueKind: "new" }] } },
			{ ...snapshot, transfer: { ...snapshot.transfer, queue: [{ noteId: 8, exampleIndex: 1, queueKind: "unknown" }] } },
		];
		for (const value of malformed) expect(parseTranslationFeedbackSnapshot(JSON.stringify(value), expected)).toBeNull();
		expect(parseTranslationFeedbackSnapshot("not json", expected)).toBeNull();
	});
});
