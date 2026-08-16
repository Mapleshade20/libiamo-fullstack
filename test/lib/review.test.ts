import { describe, expect, it } from "vitest";
import { advanceReviewQueue, countStudyQueue, orderReviewQueue, type StudyQueueKind } from "$lib/review";

type QueueCard = { id: number; queueKind: StudyQueueKind; due: string; value: string };

const NOW = new Date("2025-06-11T12:00:00Z");

describe("review queue", () => {
	it("moves learning cards to the tail and removes graduated cards", () => {
		let queue: QueueCard[] = [
			{ id: 1, queueKind: "new", due: "2025-06-11T12:00:00Z", value: "first" },
			{ id: 2, queueKind: "review", due: "2025-06-11T12:00:00Z", value: "second" },
		];

		queue = advanceReviewQueue(queue, { id: 1, queueKind: "learning", due: "2025-06-11T12:01:00Z", value: "updated" }, NOW);
		expect(queue).toEqual([
			{ id: 2, queueKind: "review", due: "2025-06-11T12:00:00Z", value: "second" },
			{ id: 1, queueKind: "learning", due: "2025-06-11T12:01:00Z", value: "updated" },
		]);
		expect(countStudyQueue(queue)).toEqual({ new: 0, learning: 1, review: 1 });

		queue = advanceReviewQueue(queue, { id: 2, queueKind: "review", due: "2025-06-13T12:00:00Z", value: "graduated" }, NOW);
		expect(queue).toEqual([{ id: 1, queueKind: "learning", due: "2025-06-11T12:01:00Z", value: "updated" }]);
	});

	it("orders due learning before the main queue and learn-ahead cards after it", () => {
		const queue: QueueCard[] = [
			{ id: 1, queueKind: "new", due: "2025-06-11T12:00:00Z", value: "new" },
			{ id: 2, queueKind: "learning", due: "2025-06-11T12:10:00Z", value: "ahead" },
			{ id: 3, queueKind: "review", due: "2025-06-10T12:00:00Z", value: "review" },
			{ id: 4, queueKind: "learning", due: "2025-06-11T11:59:00Z", value: "due learning" },
		];

		expect(orderReviewQueue(queue, NOW).map((card) => card.id)).toEqual([4, 1, 3, 2]);
	});

	it("avoids repeating the same learn-ahead card when another learning card is available", () => {
		const queue: QueueCard[] = [
			{ id: 1, queueKind: "learning", due: "2025-06-11T12:01:00Z", value: "active" },
			{ id: 2, queueKind: "learning", due: "2025-06-11T12:10:00Z", value: "other" },
		];
		const advanced = advanceReviewQueue(queue, { id: 1, queueKind: "learning", due: "2025-06-11T12:01:00Z", value: "active again" }, NOW);
		expect(advanced.map((card) => card.id)).toEqual([2, 1]);
	});

	it("rejects a response for a card that is not active", () => {
		expect(() =>
			advanceReviewQueue([{ id: 1, queueKind: "new", due: "2025-06-11T12:00:00Z", value: "first" }], {
				id: 2,
				queueKind: "learning",
				due: "2025-06-11T12:01:00Z",
				value: "other",
			}),
		).toThrow("not at the front");
	});
});
