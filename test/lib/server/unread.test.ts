import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		update: vi.fn(),
		select: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));

import { markAssistantMessagesSeen } from "$lib/server/unread";

/** Flattens a drizzle SQL object's chunks into the literal text it will emit. */
function sqlText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(sqlText).join(" ");
	if (value && typeof value === "object") {
		if ("queryChunks" in value) return sqlText((value as { queryChunks: unknown }).queryChunks);
		if ("value" in value) return sqlText((value as { value: unknown }).value);
	}
	return "";
}

describe("markAssistantMessagesSeen", () => {
	let setMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.resetAllMocks();
		setMock = vi.fn(() => ({ where: vi.fn() }));
		mockDb.update.mockImplementation(() => ({ set: setMock }));
	});

	// The session page polls while replies land, so two loads can overlap. If the
	// older snapshot's smaller id were written last the watermark would move
	// backwards and already-read replies would resurface as unread.
	it("moves the watermark forward only, resolving the maximum in the database", async () => {
		await markAssistantMessagesSeen(42, "user-1", 10);

		expect(setMock).toHaveBeenCalledTimes(1);
		expect(sqlText(setMock.mock.calls[0][0].lastSeenAssistantMessageId)).toContain("greatest");
	});

	it("skips the write when the session has no assistant message yet", async () => {
		await markAssistantMessagesSeen(42, "user-1", 0);

		expect(mockDb.update).not.toHaveBeenCalled();
	});
});
