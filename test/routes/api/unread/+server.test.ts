import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ limit: vi.fn(), mark: vi.fn(), select: vi.fn() }));
vi.mock("$lib/server/db", () => ({ db: { select: mocks.select } }));
vi.mock("$lib/server/unread", () => ({ getUnreadInbox: vi.fn(), markAssistantMessagesSeen: mocks.mark }));

import { POST } from "../../../../src/routes/api/unread/+server";

function post(body: unknown, authenticated = true) {
	return POST({
		locals: { user: authenticated ? { id: "reader" } : null },
		request: new Request("http://localhost/api/unread", { method: "POST", body: JSON.stringify(body) }),
	} as Parameters<typeof POST>[0]);
}

describe("conversation read receipts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.select.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: mocks.limit }) }) }) });
	});
	it("requires authentication and positive integer message identifiers", async () => {
		expect((await post({ sessionId: 1, messageId: 2 }, false)).status).toBe(401);
		expect((await post({ sessionId: 1, messageId: -2 })).status).toBe(400);
		expect(mocks.select).not.toHaveBeenCalled();
		expect(mocks.mark).not.toHaveBeenCalled();
	});
	it("does not advance the watermark when the owned assistant message is absent", async () => {
		mocks.limit.mockResolvedValue([]);
		expect((await post({ sessionId: 1, messageId: 2 })).status).toBe(404);
		expect(mocks.mark).not.toHaveBeenCalled();
	});
	it("acknowledges the displayed snapshot, not newer arrivals", async () => {
		mocks.limit.mockResolvedValue([{ id: 2 }]);
		expect((await post({ sessionId: 1, messageId: 2 })).status).toBe(204);
		expect(mocks.mark).toHaveBeenCalledExactlyOnceWith(1, "reader", 2);
	});
});
