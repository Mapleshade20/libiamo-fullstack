import type { UnreadInboxItem } from "$lib/unread";

export type UnreadSubscriptionStatus = "loading" | "ready" | "error";

export interface UnreadSubscriptionState {
	items: UnreadInboxItem[];
	total: number;
	status: UnreadSubscriptionStatus;
}

export interface UnreadHallFact {
	taskId: number;
	sessionStatus: string | null;
	unreadCount: number;
}

interface VisibilitySource {
	readonly hidden: boolean;
	addEventListener(type: "visibilitychange", listener: () => void): void;
	removeEventListener(type: "visibilitychange", listener: () => void): void;
}

interface CreateUnreadSubscriptionOptions {
	endpoint: string;
	initialTotal?: number;
	intervalMs?: number;
	fetcher?: typeof fetch;
	visibilitySource?: VisibilitySource;
	onchange: (state: UnreadSubscriptionState) => void;
	onHallFactsChange?: () => void;
	getHallFacts?: () => readonly UnreadHallFact[];
}

export function getUnreadTotal(items: readonly Pick<UnreadInboxItem, "unreadCount">[]): number {
	return items.reduce((sum, item) => sum + item.unreadCount, 0);
}

/**
 * Hall task facts care about membership, status, and unread counts. Relative
 * ages intentionally do not participate: their routine polling updates should
 * never reload the Hall data or disturb the reader's current spread.
 */
export function unreadHallFactsChanged(previous: readonly UnreadInboxItem[], next: readonly UnreadInboxItem[]): boolean {
	if (previous.length !== next.length) return true;
	const previousFacts = new Map(previous.map((item) => [item.taskId, `${item.sessionStatus}:${item.unreadCount}`]));
	return next.some((item) => previousFacts.get(item.taskId) !== `${item.sessionStatus}:${item.unreadCount}`);
}

export function unreadHallSnapshotChanged(snapshot: readonly UnreadHallFact[], items: readonly UnreadInboxItem[]): boolean {
	const itemsByTaskId = new Map(items.map((item) => [item.taskId, item]));
	return snapshot.some((fact) => {
		const item = itemsByTaskId.get(fact.taskId);
		if (!item) return fact.unreadCount !== 0;
		return item.unreadCount !== fact.unreadCount || item.sessionStatus !== fact.sessionStatus;
	});
}

export function createUnreadSubscription({
	endpoint,
	initialTotal = 0,
	intervalMs = 12_000,
	fetcher = fetch,
	visibilitySource = document,
	onchange,
	onHallFactsChange,
	getHallFacts,
}: CreateUnreadSubscriptionOptions) {
	let state: UnreadSubscriptionState = { items: [], total: initialTotal, status: "loading" };
	let successfulItems: UnreadInboxItem[] | null = null;
	let activeRequest: Promise<void> | null = null;
	let controller: AbortController | null = null;
	let destroyed = false;

	async function performRefresh(): Promise<void> {
		controller = new AbortController();
		try {
			const response = await fetcher(endpoint, {
				headers: { accept: "application/json" },
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`Unread request failed with ${response.status}`);
			const body = (await response.json()) as { items?: UnreadInboxItem[]; total?: number };
			if (!Array.isArray(body.items)) throw new Error("Unread response is missing items");
			if (destroyed) return;

			const items = body.items;
			const total = Number.isSafeInteger(body.total) && (body.total ?? -1) >= 0 ? (body.total as number) : getUnreadTotal(items);
			// The first response may already differ from the server-rendered Hall if a
			// reply arrived between SSR and subscription startup. Refresh once so cards
			// and recommendations reconcile with the authoritative inbox facts.
			const hallFactsChanged = getHallFacts
				? unreadHallSnapshotChanged(getHallFacts(), items)
				: successfulItems === null || unreadHallFactsChanged(successfulItems, items);
			successfulItems = items;
			state = { items, total, status: "ready" };
			onchange(state);
			if (hallFactsChanged) onHallFactsChange?.();
		} catch (cause) {
			if (destroyed || (cause instanceof DOMException && cause.name === "AbortError")) return;
			state = { ...state, status: "error" };
			onchange(state);
		} finally {
			controller = null;
		}
	}

	function refresh(): Promise<void> {
		if (destroyed) return Promise.resolve();
		if (activeRequest) return activeRequest;
		activeRequest = performRefresh().finally(() => {
			activeRequest = null;
		});
		return activeRequest;
	}

	const onVisibilityChange = () => {
		if (!visibilitySource.hidden) void refresh();
	};
	visibilitySource.addEventListener("visibilitychange", onVisibilityChange);
	const interval = setInterval(() => {
		if (!visibilitySource.hidden) void refresh();
	}, intervalMs);
	void refresh();

	function destroy(): void {
		if (destroyed) return;
		destroyed = true;
		clearInterval(interval);
		visibilitySource.removeEventListener("visibilitychange", onVisibilityChange);
		controller?.abort();
		controller = null;
	}

	return { refresh, destroy };
}
