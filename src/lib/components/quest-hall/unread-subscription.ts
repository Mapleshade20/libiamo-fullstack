import { planAgentWorkPolling } from "$lib/practice/agent-work-polling";
import { type UnreadInboxItem, unreadEntryKey } from "$lib/practice/unread";

/** `setTimeout` overflows past this and fires at once. */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

export type UnreadSubscriptionStatus = "loading" | "ready" | "error";

export interface UnreadSubscriptionState {
	items: UnreadInboxItem[];
	total: number;
	status: UnreadSubscriptionStatus;
}

export interface UnreadHallFact {
	taskId: number;
	lineupId: number | null;
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
	now?: () => Date;
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
	const previousFacts = new Map(previous.map((item) => [unreadEntryKey(item), `${item.sessionStatus}:${item.unreadCount}`]));
	return next.some((item) => previousFacts.get(unreadEntryKey(item)) !== `${item.sessionStatus}:${item.unreadCount}`);
}

export function unreadHallSnapshotChanged(snapshot: readonly UnreadHallFact[], items: readonly UnreadInboxItem[]): boolean {
	const itemsByEntry = new Map(items.map((item) => [unreadEntryKey(item), item]));
	return snapshot.some((fact) => {
		const item = itemsByEntry.get(unreadEntryKey(fact));
		if (!item) return fact.unreadCount !== 0;
		return item.unreadCount !== fact.unreadCount || item.sessionStatus !== fact.sessionStatus;
	});
}

function parseDueAt(value: unknown): Date | null {
	if (typeof value !== "string") return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Keeps the Hall's inbox current. Replies only appear when agent work falls due, so the server
 * reports the next due time and the subscription follows `planAgentWorkPolling`: poll at
 * `intervalMs` while a reply is close, wake once when it is far, and stay silent when nothing is
 * outstanding. Returning to a hidden tab refreshes, which also covers work started elsewhere.
 */
export function createUnreadSubscription({
	endpoint,
	initialTotal = 0,
	intervalMs = 12_000,
	fetcher = fetch,
	visibilitySource = document,
	onchange,
	onHallFactsChange,
	getHallFacts,
	now = () => new Date(),
}: CreateUnreadSubscriptionOptions) {
	let state: UnreadSubscriptionState = { items: [], total: initialTotal, status: "loading" };
	let successfulItems: UnreadInboxItem[] | null = null;
	let activeRequest: Promise<void> | null = null;
	let controller: AbortController | null = null;
	let destroyed = false;
	let nextAgentWorkDueAt: Date | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function performRefresh(): Promise<void> {
		controller = new AbortController();
		try {
			const response = await fetcher(endpoint, {
				headers: { accept: "application/json" },
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`Unread request failed with ${response.status}`);
			const body = (await response.json()) as { items?: UnreadInboxItem[]; total?: number; nextAgentWorkDueAt?: unknown };
			if (!Array.isArray(body.items)) throw new Error("Unread response is missing items");
			if (destroyed) return;
			nextAgentWorkDueAt = parseDueAt(body.nextAgentWorkDueAt);

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

	function schedule(): void {
		if (timer) clearTimeout(timer);
		timer = null;
		if (destroyed || visibilitySource.hidden) return;
		// A failed read retries at the polling interval rather than trusting a stale due time.
		const plan =
			state.status === "error"
				? ({ kind: "interval" } as const)
				: planAgentWorkPolling({ hasPendingPlaceholder: false, agentWorkDueAt: nextAgentWorkDueAt, now: now() });
		if (plan.kind === "none") return;
		const delay = plan.kind === "interval" ? intervalMs : Math.min(plan.delayMs, MAX_TIMER_DELAY_MS);
		timer = setTimeout(() => {
			timer = null;
			if (!visibilitySource.hidden) void refresh();
		}, delay);
	}

	function refresh(): Promise<void> {
		if (destroyed) return Promise.resolve();
		if (activeRequest) return activeRequest;
		activeRequest = performRefresh().finally(() => {
			activeRequest = null;
			schedule();
		});
		return activeRequest;
	}

	const onVisibilityChange = () => {
		if (!visibilitySource.hidden) void refresh();
	};
	visibilitySource.addEventListener("visibilitychange", onVisibilityChange);
	void refresh();

	function destroy(): void {
		if (destroyed) return;
		destroyed = true;
		if (timer) clearTimeout(timer);
		timer = null;
		visibilitySource.removeEventListener("visibilitychange", onVisibilityChange);
		controller?.abort();
		controller = null;
	}

	return { refresh, destroy };
}
