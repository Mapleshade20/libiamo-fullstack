import { scenarioHref } from "#lib/scenario/href.ts";

/* Replies the learner has not seen yet, by exchange: the home page's "someone answered you". */
export type UnreadInboxItem = {
	exchangeId: number;
	pieceId: string;
	scenarioId: string | null;
	language: string;
	title: string;
	place: string;
	status: string;
	unreadCount: number;
	latestAgeSeconds: number | null;
};

/** Where an unread reply is read: the place while the exchange goes on, else the after page. */
export function unreadTargetHref(item: Pick<UnreadInboxItem, "scenarioId" | "status" | "language">): string {
	return scenarioHref(item.scenarioId ?? "", item.status === "in_progress" ? "play" : "after", item.language);
}

export function formatUnreadBadgeCount(count: number): string {
	return count > 9 ? "9+" : String(count);
}
