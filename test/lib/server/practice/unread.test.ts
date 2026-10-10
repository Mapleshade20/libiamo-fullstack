import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		update: vi.fn(),
		select: vi.fn(),
		execute: vi.fn(),
		transaction: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));

import { acknowledgeAssistantMessage, getNextAgentWorkDueAt } from "$lib/server/practice/unread";

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
	let tx: {
		select: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		insert: ReturnType<typeof vi.fn>;
		query: {
			agentResponseBatch: { findFirst: ReturnType<typeof vi.fn> };
			practiceSession: { findFirst: ReturnType<typeof vi.fn> };
			user: { findFirst: ReturnType<typeof vi.fn> };
		};
	};

	beforeEach(() => {
		vi.resetAllMocks();
		returning = vi.fn().mockResolvedValue([{ id: 42 }]);
		whereMock = vi.fn(() => ({ returning }));
		setMock = vi.fn(() => ({ where: whereMock }));
		tx = {
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => Object.assign(Promise.resolve([{ id: 42 }]), { for: vi.fn().mockResolvedValue([{ id: 42 }]) })),
				})),
			})),
			update: vi.fn(() => ({ set: setMock })),
			insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ id: 99 }]) })),
			query: {
				agentResponseBatch: { findFirst: vi.fn().mockResolvedValue({ id: 55 }) },
				practiceSession: { findFirst: vi.fn().mockResolvedValue(null) },
				user: { findFirst: vi.fn().mockResolvedValue({ name: "Maple" }) },
			},
		};
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
	});

	// Two acknowledgements can overlap. If the older snapshot's smaller id were
	// written last the watermark would move backwards and already-read replies
	// would resurface as unread.
	it("moves the watermark forward only, resolving the maximum in the database", async () => {
		await expect(acknowledgeAssistantMessage(42, "user-1", 10)).resolves.toEqual({ acknowledged: true, worldScheduled: false });

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
		await expect(acknowledgeAssistantMessage(42, "user-1", 10)).resolves.toEqual({ acknowledged: false, worldScheduled: false });
	});

	it("reports a session the reader does not own as not acknowledged", async () => {
		(tx.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => Object.assign(Promise.resolve([]), { for: vi.fn().mockResolvedValue([]) })),
			})),
		}));
		await expect(acknowledgeAssistantMessage(42, "user-1", 10)).resolves.toEqual({ acknowledged: false, worldScheduled: false });
		expect(setMock).not.toHaveBeenCalled();
	});

	it("resumes ambient life on reading when no reply work is outstanding", async () => {
		// no outstanding reply batches; the async group session is eligible for a world moment
		tx.query.agentResponseBatch.findFirst.mockResolvedValue(null);
		tx.query.practiceSession.findFirst.mockResolvedValue({
			id: 42,
			userId: "user-1",
			status: "in_progress",
			expiresAt: new Date(Date.now() + 3_600_000),
			task: { id: 1, ui: "reddit", language: "en", openingState: { post: { author: "op" } }, urgency: "high" },
			messages: [{ id: 1, role: "user", content: "anyone?", createdAt: new Date() }],
		});
		const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
		(tx.insert as ReturnType<typeof vi.fn>).mockImplementation((table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				inserts.push({ table, values });
				return [{ id: 99 }];
			},
		}));

		await expect(acknowledgeAssistantMessage(42, "user-1", 10)).resolves.toEqual({ acknowledged: true, worldScheduled: true });

		const world = inserts.find((insert) => (insert.values as { kind?: string }).kind === "world");
		expect(world?.values).toMatchObject({ sessionId: 42, status: "pending", inputMessageId: null });
		expect(typeof world?.values.participant).toBe("string");
	});

	it("does not resume ambient life while reply work is still outstanding", async () => {
		// a taker is still composing for the learner's last message
		tx.query.agentResponseBatch.findFirst.mockResolvedValue({ id: 55 });
		const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
		(tx.insert as ReturnType<typeof vi.fn>).mockImplementation((table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				inserts.push({ table, values });
				return [{ id: 99 }];
			},
		}));

		await expect(acknowledgeAssistantMessage(42, "user-1", 10)).resolves.toEqual({ acknowledged: true, worldScheduled: false });

		expect(inserts).toEqual([]);
	});
});

describe("getNextAgentWorkDueAt", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({}));
	});

	it("reads composing batches and pacing deliveries in one statement, taking the least", async () => {
		const soonest = new Date("2026-08-21T12:01:00.000Z");
		mockDb.execute.mockResolvedValue([{ dueAt: soonest }]);

		await expect(getNextAgentWorkDueAt("user-1")).resolves.toEqual(soonest);

		// one snapshot for both halves: a commit between two separate reads could hide live work
		expect(mockDb.execute).toHaveBeenCalledTimes(1);
		const statement = sqlText((mockDb.execute.mock.calls[0] as unknown[])[0]);
		expect(statement).toContain("least");
		expect(statement).toContain("'pending', 'processing', 'stale'");
		// delivery-pending batches count through their pending deliveries, never their own stale due time
		expect(statement).toContain("b.status = 'delivery_pending' and d.status = 'pending'");
		expect(statement).toContain("user-1");
	});

	it("returns null when nothing is outstanding", async () => {
		mockDb.execute.mockResolvedValue([{ dueAt: null }]);
		await expect(getNextAgentWorkDueAt("user-1")).resolves.toBeNull();
	});

	it("reads the database's naive UTC timestamp as UTC, whatever the server's timezone", async () => {
		// the driver returns "2026-10-10 00:05:00" — no offset; parsing it by the local timezone
		// (Shanghai) would place it eight hours early and force endless polling
		mockDb.execute.mockResolvedValue([{ dueAt: "2026-10-10 00:05:00" }]);
		await expect(getNextAgentWorkDueAt("user-1")).resolves.toEqual(new Date("2026-10-10T00:05:00.000Z"));
	});
});
