import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createUnreadSubscription,
	getUnreadTotal,
	type UnreadSubscriptionState,
	unreadHallFactsChanged,
	unreadHallSnapshotChanged,
} from "$lib/components/quest-hall/unread-subscription";
import { AGENT_WORK_WAKE_BUFFER_MS } from "$lib/practice/agent-work-polling";
import type { UnreadInboxItem } from "$lib/practice/unread";

function item(taskId: number, overrides: Partial<UnreadInboxItem> = {}): UnreadInboxItem {
	return {
		sessionId: taskId,
		taskId,
		lineupId: 1,
		title: `Task ${taskId}`,
		ui: "imessage",
		sessionStatus: "in_progress",
		unreadCount: 1,
		latestAgeSeconds: 20,
		...overrides,
	};
}

function response(items: UnreadInboxItem[], total = getUnreadTotal(items), nextAgentWorkDueAt: string | null = null): Response {
	return new Response(JSON.stringify({ items, total, nextAgentWorkDueAt }), { status: 200, headers: { "content-type": "application/json" } });
}

function dueIn(ms: number): string {
	return new Date(Date.now() + ms).toISOString();
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

	it("reconciles the first response, then refreshes Hall facts for changes but not age-only updates", async () => {
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

		expect(onHallFactsChange).toHaveBeenCalledTimes(4);
		subscription.destroy();
	});

	it("does not invalidate the Hall when the first response matches its SSR task facts", async () => {
		const current = item(1);
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response([current, item(99, { title: "Historical task" })]))
			.mockResolvedValueOnce(response([{ ...current, unreadCount: 2 }, item(99, { title: "Historical task" })]));
		const onHallFactsChange = vi.fn();
		const subscription = createUnreadSubscription({
			endpoint: "/api/unread",
			fetcher,
			visibilitySource: visibilitySource(),
			onchange: vi.fn(),
			onHallFactsChange,
			getHallFacts: () => [
				{ taskId: current.taskId, lineupId: current.lineupId, sessionStatus: current.sessionStatus, unreadCount: current.unreadCount },
			],
		});

		await subscription.refresh();
		expect(onHallFactsChange).not.toHaveBeenCalled();

		await subscription.refresh();
		expect(onHallFactsChange).toHaveBeenCalledOnce();
		subscription.destroy();
	});

	it("stays silent while no agent work is outstanding, refreshing only when the tab returns", async () => {
		vi.useFakeTimers();
		const source = visibilitySource();
		const fetcher = vi.fn(async () => response([]));
		const subscription = createUnreadSubscription({ endpoint: "/api/unread", fetcher, visibilitySource: source, onchange: vi.fn() });
		await vi.advanceTimersByTimeAsync(0);
		expect(fetcher).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(fetcher).toHaveBeenCalledTimes(1);

		source.hidden = true;
		source.dispatch();
		source.hidden = false;
		source.dispatch();
		await vi.advanceTimersByTimeAsync(0);
		expect(fetcher).toHaveBeenCalledTimes(2);

		subscription.destroy();
		expect(source.listenerCount()).toBe(0);
	});

	it("polls at the interval while a reply is due soon, then stops once it has landed", async () => {
		vi.useFakeTimers();
		const fetcher = vi
			.fn()
			.mockImplementationOnce(async () => response([], 0, dueIn(5_000)))
			.mockImplementationOnce(async () => response([], 0, dueIn(-1_000)))
			.mockImplementation(async () => response([item(1)]));
		const subscription = createUnreadSubscription({ endpoint: "/api/unread", fetcher, visibilitySource: visibilitySource(), onchange: vi.fn() });
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(12_000);
		expect(fetcher).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(12_000);
		expect(fetcher).toHaveBeenCalledTimes(3);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(fetcher).toHaveBeenCalledTimes(3);
		subscription.destroy();
	});

	it("wakes once when the next reply is far off", async () => {
		vi.useFakeTimers();
		const fetcher = vi
			.fn()
			.mockImplementationOnce(async () => response([], 0, dueIn(10 * 60_000)))
			.mockImplementation(async () => response([]));
		const subscription = createUnreadSubscription({ endpoint: "/api/unread", fetcher, visibilitySource: visibilitySource(), onchange: vi.fn() });
		await vi.advanceTimersByTimeAsync(9 * 60_000);
		expect(fetcher).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000 + AGENT_WORK_WAKE_BUFFER_MS);
		expect(fetcher).toHaveBeenCalledTimes(2);
		subscription.destroy();
	});

	it("retries a failed read at the interval, and never while the tab is hidden", async () => {
		vi.useFakeTimers();
		const source = visibilitySource();
		const fetcher = vi
			.fn()
			.mockRejectedValueOnce(new Error("offline"))
			.mockImplementation(async () => response([]));
		const subscription = createUnreadSubscription({ endpoint: "/api/unread", fetcher, visibilitySource: source, onchange: vi.fn() });
		await vi.advanceTimersByTimeAsync(0);
		source.hidden = true;
		await vi.advanceTimersByTimeAsync(12_000);
		expect(fetcher).toHaveBeenCalledTimes(1);

		source.hidden = false;
		source.dispatch();
		await vi.advanceTimersByTimeAsync(0);
		expect(fetcher).toHaveBeenCalledTimes(2);
		subscription.destroy();
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

	it("compares only tasks represented by the current Hall snapshot", () => {
		const snapshot = [{ taskId: 1, lineupId: 1, sessionStatus: "in_progress", unreadCount: 0 }];
		expect(unreadHallSnapshotChanged(snapshot, [item(99)])).toBe(false);
		expect(unreadHallSnapshotChanged(snapshot, [item(1, { lineupId: 2 })])).toBe(false);
		expect(unreadHallSnapshotChanged(snapshot, [item(1)])).toBe(true);
		expect(unreadHallSnapshotChanged([{ ...snapshot[0], unreadCount: 1 }], [])).toBe(true);
	});
});
