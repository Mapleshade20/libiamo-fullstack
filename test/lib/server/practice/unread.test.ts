import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		update: vi.fn(),
		select: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));

import { acknowledgeAssistantMessage } from "$lib/server/practice/unread";

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

describe("acknowledgeAssistantMessage", () => {
	let setMock: ReturnType<typeof vi.fn>;
	let whereMock: ReturnType<typeof vi.fn>;
	let returning: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.resetAllMocks();
		returning = vi.fn().mockResolvedValue([{ id: 42 }]);
		whereMock = vi.fn(() => ({ returning }));
		setMock = vi.fn(() => ({ where: whereMock }));
		mockDb.update.mockImplementation(() => ({ set: setMock }));
	});

	// Two acknowledgements can overlap. If the older snapshot's smaller id were
	// written last the watermark would move backwards and already-read replies
	// would resurface as unread.
	it("moves the watermark forward only, resolving the maximum in the database", async () => {
		await expect(acknowledgeAssistantMessage(42, "user-1", 10)).resolves.toBe(true);

		expect(setMock).toHaveBeenCalledTimes(1);
		expect(sqlText(setMock.mock.calls[0][0].lastSeenAssistantMessageId)).toContain("greatest");
	});

	it("proves ownership and the assistant role in the same statement", async () => {
		await acknowledgeAssistantMessage(42, "user-1", 10);
		const condition = sqlText(whereMock.mock.calls[0][0]);
		expect(condition).toContain("exists");
		expect(condition).toContain("'assistant'");
	});

	it("reports a message outside the reader's sessions as not acknowledged", async () => {
		returning.mockResolvedValue([]);
		await expect(acknowledgeAssistantMessage(42, "user-1", 10)).resolves.toBe(false);
	});
});
