import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createUnreadSubscription,
	getUnreadTotal,
	type UnreadSubscriptionState,
	unreadHallFactsChanged,
} from "$lib/client/quest-hall/unread-subscription";
import type { UnreadInboxItem } from "$lib/unread";

function item(taskId: number, overrides: Partial<UnreadInboxItem> = {}): UnreadInboxItem {
	return {
		taskId,
		title: `Task ${taskId}`,
		ui: "imessage",
		sessionStatus: "in_progress",
		unreadCount: 1,
		latestAgeSeconds: 20,
		...overrides,
	};
}

function response(items: UnreadInboxItem[], total = getUnreadTotal(items)): Response {
	return new Response(JSON.stringify({ items, total }), { status: 200, headers: { "content-type": "application/json" } });
}

function visibilitySource(hidden = false) {
	const listeners = new Set<() => void>();
	return {
		hidden,
		addEventListener: (_type: "visibilitychange", listener: () => void) => listeners.add(listener),
		removeEventListener: (_type: "visibilitychange", listener: () => void) => listeners.delete(listener),
		dispatch: () => {
			for (const listener of listeners) listener();
		},
		listenerCount: () => listeners.size,
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe("Quest Hall unread subscription", () => {
	it("counts zero, one, nine, and ten replies without capping the underlying total", () => {
		expect(getUnreadTotal([])).toBe(0);
		expect(getUnreadTotal([item(1)])).toBe(1);
		expect(getUnreadTotal([item(1, { unreadCount: 9 })])).toBe(9);
		expect(getUnreadTotal([item(1, { unreadCount: 6 }), item(2, { unreadCount: 4 })])).toBe(10);
	});

	it("retains historical and other-language rows from the production response", async () => {
		const rows = [item(11, { title: "Old French quest" }), item(22, { title: "Spanish quest", unreadCount: 2 })];
		const states: UnreadSubscriptionState[] = [];
		const source = visibilitySource();
		const subscription = createUnreadSubscription({
			endpoint: "/api/unread",
			fetcher: vi.fn().mockResolvedValue(response(rows)),
			visibilitySource: source,
			onchange: (state) => states.push(state),
		});

		await subscription.refresh();

		expect(states.at(-1)).toEqual({ items: rows, total: 3, status: "ready" });
		subscription.destroy();
	});

	it("keeps the last good count through a transient failure and recovers", async () => {
		const states: UnreadSubscriptionState[] = [];
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response([item(1, { unreadCount: 4 })]))
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(response([item(1, { unreadCount: 5 })]));
		const subscription = createUnreadSubscription({
			endpoint: "/api/unread",
			fetcher,
			visibilitySource: visibilitySource(),
			onchange: (state) => states.push(state),
		});

		await subscription.refresh();
		await subscription.refresh();
		await subscription.refresh();

		expect(states.map(({ status, total }) => ({ status, total }))).toEqual([
			{ status: "ready", total: 4 },
			{ status: "error", total: 4 },
			{ status: "ready", total: 5 },
		]);
		subscription.destroy();
	});

	it("refreshes Hall facts for membership, status, and count changes but not age-only updates", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response([item(1)]))
			.mockResolvedValueOnce(response([item(1, { latestAgeSeconds: 40 })]))
			.mockResolvedValueOnce(response([item(1, { unreadCount: 2 })]))
			.mockResolvedValueOnce(response([item(1, { unreadCount: 2, sessionStatus: "completed" })]))
			.mockResolvedValueOnce(response([item(2)]));
		const onHallFactsChange = vi.fn();
		const subscription = createUnreadSubscription({
			endpoint: "/api/unread",
			fetcher,
			visibilitySource: visibilitySource(),
			onchange: vi.fn(),
			onHallFactsChange,
		});

		for (let index = 0; index < 5; index += 1) await subscription.refresh();

		expect(onHallFactsChange).toHaveBeenCalledTimes(3);
		subscription.destroy();
	});

	it("polls only while visible, refreshes on visibility return, and cleans up", async () => {
		vi.useFakeTimers();
		const source = visibilitySource(true);
		const fetcher = vi.fn().mockResolvedValue(response([]));
		const subscription = createUnreadSubscription({
			endpoint: "/api/unread",
			fetcher,
			visibilitySource: source,
			onchange: vi.fn(),
		});
		await subscription.refresh();
		expect(fetcher).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(12_000);
		expect(fetcher).toHaveBeenCalledTimes(1);
		source.hidden = false;
		source.dispatch();
		await Promise.resolve();
		expect(fetcher).toHaveBeenCalledTimes(2);

		subscription.destroy();
		expect(source.listenerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(24_000);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
});

describe("unread Hall fact comparison", () => {
	it("ignores relative age and ordering while detecting the facts shown on cards", () => {
		const first = item(1);
		const second = item(2, { unreadCount: 2 });
		expect(
			unreadHallFactsChanged(
				[first, second],
				[
					{ ...second, latestAgeSeconds: 80 },
					{ ...first, latestAgeSeconds: 70 },
				],
			),
		).toBe(false);
		expect(unreadHallFactsChanged([first], [{ ...first, unreadCount: 2 }])).toBe(true);
		expect(unreadHallFactsChanged([first], [{ ...first, sessionStatus: "evaluated" }])).toBe(true);
		expect(unreadHallFactsChanged([first], [item(3)])).toBe(true);
	});
});
