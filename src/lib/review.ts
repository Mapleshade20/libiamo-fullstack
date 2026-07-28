export type StudyQueueKind = "new" | "learning" | "review";

export type StudyQueueCounts = Record<StudyQueueKind, number>;

export function countStudyQueue(items: readonly { queueKind: StudyQueueKind }[]): StudyQueueCounts {
	const counts: StudyQueueCounts = { new: 0, learning: 0, review: 0 };
	for (const item of items) counts[item.queueKind]++;
	return counts;
}

export function advanceReviewQueue<T extends { id: number; queueKind: StudyQueueKind }>(queue: readonly T[], updatedCard: T): T[] {
	const activeCard = queue[0];
	if (!activeCard || activeCard.id !== updatedCard.id) throw new Error("The rated card is not at the front of the review queue.");
	const remaining = queue.slice(1);
	return updatedCard.queueKind === "learning" ? [...remaining, updatedCard] : remaining;
}
