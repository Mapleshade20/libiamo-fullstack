export type StudyQueueKind = "new" | "learning" | "review";

export type StudyQueueCounts = Record<StudyQueueKind, number>;

export type ReviewQueueItem = {
	id: number;
	queueKind: StudyQueueKind;
	due: string;
};

export function countStudyQueue(items: readonly { queueKind: StudyQueueKind }[]): StudyQueueCounts {
	const counts: StudyQueueCounts = { new: 0, learning: 0, review: 0 };
	for (const item of items) counts[item.queueKind]++;
	return counts;
}

function dueTimestamp(item: ReviewQueueItem): number {
	const timestamp = new Date(item.due).getTime();
	return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

export function orderReviewQueue<T extends ReviewQueueItem>(queue: readonly T[], now = new Date()): T[] {
	const nowTimestamp = now.getTime();
	return queue
		.map((item, index) => ({ item, index, due: dueTimestamp(item) }))
		.sort((left, right) => {
			const leftBucket = left.item.queueKind === "learning" ? (left.due <= nowTimestamp ? 0 : 2) : 1;
			const rightBucket = right.item.queueKind === "learning" ? (right.due <= nowTimestamp ? 0 : 2) : 1;
			if (leftBucket !== rightBucket) return leftBucket - rightBucket;
			if (leftBucket !== 1 && left.due !== right.due) return left.due - right.due;
			return left.index - right.index;
		})
		.map(({ item }) => item);
}

export function advanceReviewQueue<T extends ReviewQueueItem>(queue: readonly T[], updatedCard: T, now = new Date()): T[] {
	const activeCard = queue[0];
	if (!activeCard || activeCard.id !== updatedCard.id) throw new Error("The rated card is not at the front of the review queue.");
	const remaining = queue.slice(1);
	if (updatedCard.queueKind !== "learning") return orderReviewQueue(remaining, now);

	const ordered = orderReviewQueue([...remaining, updatedCard], now);
	if (ordered.length > 1 && ordered[0]?.id === updatedCard.id && dueTimestamp(updatedCard) > now.getTime()) {
		return [ordered[1], updatedCard, ...ordered.slice(2)];
	}
	return ordered;
}
