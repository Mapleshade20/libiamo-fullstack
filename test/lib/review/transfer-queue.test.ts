import { describe, expect, it } from "vitest";
import { advanceTransferQueue, isTransferQueueState, type TransferQueueItem, transferQueueNotes } from "$lib/review/transfer-queue";

describe("transfer queue", () => {
	it("moves an incorrect Note to the tail indefinitely and removes a passed Note", () => {
		let queue: TransferQueueItem[] = [
			{ noteId: 8, exampleIndex: 0, queueKind: "new" },
			{ noteId: 9, exampleIndex: 1, queueKind: "review" },
		];
		queue = advanceTransferQueue(queue, "incorrect", 2);
		expect(queue).toEqual([
			{ noteId: 9, exampleIndex: 1, queueKind: "review" },
			{ noteId: 8, exampleIndex: 2, queueKind: "learning" },
		]);
		queue = advanceTransferQueue(queue, "pass");
		expect(queue).toEqual([{ noteId: 8, exampleIndex: 2, queueKind: "learning" }]);
		for (let index = 0; index < 10; index++) queue = advanceTransferQueue(queue, "incorrect", index % 4);
		expect(queue).toHaveLength(1);
		expect(queue[0].noteId).toBe(8);
	});

	it("is a no-op on an empty queue and demands an example after an incorrect answer", () => {
		expect(advanceTransferQueue([], "pass")).toEqual([]);
		expect(() => advanceTransferQueue([{ noteId: 1, exampleIndex: 0, queueKind: "new" }], "incorrect")).toThrow();
	});

	it("resolves queue entries against the loaded notes and drops vanished ones", () => {
		const notes = [
			{
				id: 8,
				vocab: "hablar",
				targetDefinition: "decir algo",
				nativeDefinition: "to speak",
				examples: [
					{ targetText: "a", nativeText: "A" },
					{ targetText: "b", nativeText: "B" },
				],
			},
		];
		const resolved = transferQueueNotes(
			[
				{ noteId: 8, exampleIndex: 1, queueKind: "learning" },
				{ noteId: 8, exampleIndex: 9, queueKind: "new" },
				{ noteId: 99, exampleIndex: 0, queueKind: "new" },
			],
			notes,
		);
		expect(resolved).toHaveLength(1);
		expect(resolved[0].examples).toEqual([{ targetText: "b", nativeText: "B" }]);
		expect(resolved[0].queueKind).toBe("learning");
	});

	it("rejects malformed stored queues", () => {
		expect(isTransferQueueState({ initialized: true, queue: [] })).toBe(true);
		expect(isTransferQueueState({ initialized: true, queue: [{ noteId: 0, exampleIndex: 2, queueKind: "new" }] })).toBe(false);
		expect(isTransferQueueState({ initialized: true, queue: [{ noteId: 8, exampleIndex: -1, queueKind: "new" }] })).toBe(false);
		expect(isTransferQueueState({ initialized: true, queue: [{ noteId: 8, exampleIndex: 1, queueKind: "unknown" }] })).toBe(false);
		expect(isTransferQueueState(null)).toBe(false);
	});
});
