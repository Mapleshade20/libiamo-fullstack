import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ acknowledge: vi.fn(), inbox: vi.fn(), nextDue: vi.fn() }));
vi.mock("$lib/server/practice/unread", () => ({
	acknowledgeAssistantMessage: mocks.acknowledge,
	getUnreadInbox: mocks.inbox,
	getNextAgentWorkDueAt: mocks.nextDue,
}));

import { GET, POST } from "../../../../src/routes/api/unread/+server";

function post(body: unknown, authenticated = true) {
	return POST({
		locals: { user: authenticated ? { id: "reader" } : null },
		request: new Request("http://localhost/api/unread", { method: "POST", body: JSON.stringify(body) }),
	} as Parameters<typeof POST>[0]);
}

describe("conversation read receipts", () => {
	beforeEach(() => vi.clearAllMocks());
	it("requires authentication and positive integer message identifiers", async () => {
		expect((await post({ sessionId: 1, messageId: 2 }, false)).status).toBe(401);
		expect((await post({ sessionId: 1, messageId: -2 })).status).toBe(400);
		expect(mocks.acknowledge).not.toHaveBeenCalled();
	});
	it("reports a message the reader does not own as missing", async () => {
		mocks.acknowledge.mockResolvedValue(false);
		expect((await post({ sessionId: 1, messageId: 2 })).status).toBe(404);
	});
	it("acknowledges the displayed snapshot, not newer arrivals", async () => {
		mocks.acknowledge.mockResolvedValue(true);
		expect((await post({ sessionId: 1, messageId: 2 })).status).toBe(204);
		expect(mocks.acknowledge).toHaveBeenCalledExactlyOnceWith(1, "reader", 2);
	});
});

describe("unread inbox", () => {
	beforeEach(() => vi.clearAllMocks());
	it("returns the inbox with its total and the next time a reply can arrive", async () => {
		const due = new Date("2026-09-18T12:00:30.000Z");
		mocks.inbox.mockResolvedValue([
			{ sessionId: 1, unreadCount: 2 },
			{ sessionId: 2, unreadCount: 1 },
		]);
		mocks.nextDue.mockResolvedValue(due);
		const response = await GET({ locals: { user: { id: "reader" } } } as Parameters<typeof GET>[0]);
		expect(await response.json()).toMatchObject({ total: 3, nextAgentWorkDueAt: due.toISOString() });
		expect(mocks.nextDue).toHaveBeenCalledWith("reader");
	});
});
