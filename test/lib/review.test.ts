import { describe, expect, it } from "vitest";
import { advanceReviewQueue, countStudyQueue, type StudyQueueKind } from "$lib/review";

type QueueCard = { id: number; queueKind: StudyQueueKind; value: string };

describe("review queue", () => {
	it("moves learning cards to the tail and removes graduated cards", () => {
		let queue: QueueCard[] = [
			{ id: 1, queueKind: "new", value: "first" },
			{ id: 2, queueKind: "review", value: "second" },
		];

		queue = advanceReviewQueue(queue, { id: 1, queueKind: "learning", value: "updated" });
		expect(queue).toEqual([
			{ id: 2, queueKind: "review", value: "second" },
			{ id: 1, queueKind: "learning", value: "updated" },
		]);
		expect(countStudyQueue(queue)).toEqual({ new: 0, learning: 1, review: 1 });

		queue = advanceReviewQueue(queue, { id: 2, queueKind: "review", value: "graduated" });
		expect(queue).toEqual([{ id: 1, queueKind: "learning", value: "updated" }]);
	});

	it("rejects a response for a card that is not active", () => {
		expect(() => advanceReviewQueue([{ id: 1, queueKind: "new", value: "first" }], { id: 2, queueKind: "learning", value: "other" })).toThrow(
			"not at the front",
		);
	});
});
