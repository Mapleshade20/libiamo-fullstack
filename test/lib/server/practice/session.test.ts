import { beforeEach, describe, expect, it, vi } from "vitest";
import * as floor from "$lib/server/practice/agent-replies/floor";

const USER_ID = "test-user-id";

const { mockDb, mockClient } = vi.hoisted(() => ({
	mockDb: {
		query: {
			task: { findFirst: vi.fn() },
			user: { findFirst: vi.fn() },
			practiceSession: { findFirst: vi.fn() },
			agentResponseBatch: { findFirst: vi.fn(), findMany: vi.fn() },
		},
		insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => []) })) })),
		update: vi.fn((_table: unknown) => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
		select: vi.fn(),
		transaction: vi.fn(),
	},
	mockClient: {
		chatText: vi.fn(),
		chatJson: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/llm/client", () => mockClient);

import { agentDelivery, agentResponseBatch, practiceSession, sessionMessage } from "$lib/server/db/schema";
import { completeSession, getSessionOrFail, startSession, submitMessage } from "$lib/server/practice/session";

/** Walks mock drizzle args, collecting bare strings while skipping plain string arrays
 * (SQL chunks, enum value lists) so inArray params can be asserted precisely. */
function collectBareStrings(value: unknown, out: string[], seen: Set<object>): void {
	if (typeof value === "string") {
		out.push(value);
		return;
	}
	if (Array.isArray(value)) {
		if (value.length > 0 && value.every((item) => typeof item === "string")) return;
		for (const item of value) collectBareStrings(item, out, seen);
		return;
	}
	if (value && typeof value === "object") {
		if (seen.has(value)) return;
		seen.add(value);
		// skip drizzle column/table internals: column `default` values leak enum names
		if ("columnType" in value || "columns" in value) return;
		for (const item of Object.values(value)) collectBareStrings(item, out, seen);
	}
}

const bareStrings = (args: unknown[]): string[] => {
	const out: string[] = [];
	collectBareStrings(args, out, new Set());
	return out;
};

describe("session service", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
		mockDb.query.agentResponseBatch.findMany.mockResolvedValue([]);
		mockDb.insert.mockImplementation(() => ({
			values: vi.fn(() => ({
				returning: vi.fn().mockResolvedValue([{ id: 999 }]),
			})),
		}));
		mockDb.update.mockImplementation(() => ({
			set: vi.fn(() => ({ where: vi.fn() })),
		}));
		mockDb.select.mockImplementation(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					for: vi.fn().mockResolvedValue([{ id: 123, status: "in_progress" }]),
				})),
			})),
		}));
	});

	/** Drives the `SELECT ... FOR UPDATE` row lock both submitMessage and completeSession take. */
	const mockLockedSessionRow = (rows: unknown[]) => {
		const forMock = vi.fn().mockResolvedValue(rows);
		mockDb.select.mockImplementation(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({ for: forMock })),
			})),
		}));
		return forMock;
	};

	const mockTask = {
		id: 1,
		interactionType: "chat" as const,
		agentPrompt: "You are a helpful assistant.",
		language: "en" as const,
		urgency: "high" as const,
		ui: "discord" as const,
		openingState: {
			serverName: "Test Server",
			previousMessages: [{ sender: "Alice", text: "Hello!" }],
		},
	};

	/** Drives `insert(...).values(...).onConflictDoNothing().returning()`. */
	const mockSessionInsert = (rows: unknown[]) => {
		const valuesMock = vi.fn(() => ({ onConflictDoNothing: vi.fn(() => ({ returning: vi.fn().mockResolvedValue(rows) })) }));
		mockDb.insert.mockReturnValue({ values: valuesMock } as never);
		return valuesMock;
	};

	describe("startSession", () => {
		it("creates the session in its lineup with the practice expiry", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2025-06-11T12:00:00.000Z"));
			try {
				mockDb.query.task.findFirst.mockResolvedValue(mockTask);
				const valuesMock = mockSessionInsert([{ id: 123 }]);

				const result = await startSession(1, "user_456", 7);

				expect(result).toEqual({ sessionId: 123 });
				expect(valuesMock).toHaveBeenCalledWith(
					expect.objectContaining({
						userId: "user_456",
						taskId: 1,
						lineupId: 7,
						startedAt: new Date("2025-06-11T12:00:00.000Z"),
						expiresAt: new Date("2025-06-13T12:00:00.000Z"),
					}),
				);
			} finally {
				vi.useRealTimers();
			}
		});

		it("returns the learner's existing session for the same lineup entry", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockSessionInsert([]);
			mockDb.query.practiceSession.findFirst.mockResolvedValue({ id: 999 });

			expect(await startSession(1, "user_456", null)).toEqual({ sessionId: 999 });
		});

		it.each([
			{ name: "task missing", taskValue: null },
			{ name: "translation task", taskValue: { interactionType: "translate" } },
		])("throws Task not found when $name", async ({ taskValue }) => {
			mockDb.query.task.findFirst.mockResolvedValue(taskValue);
			await expect(startSession(1, "user_456", null)).rejects.toThrow("Task not found");
		});

		it("throws when neither insert nor lookup yields a session", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockSessionInsert([]);
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			await expect(startSession(1, "user_456", null)).rejects.toThrow("Failed to create session");
		});
	});

	describe("submitMessage", () => {
		it("persists the user message and schedules a batch without calling the provider", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: 3 },
				messages: [],
			});
			mockDb.query.agentResponseBatch.findFirst.mockResolvedValue(null);

			const result = await submitMessage(123, "Hello", USER_ID, "client-1");

			expect(result).toEqual({ turnCount: 1, pending: true });
			expect(mockDb.insert).toHaveBeenCalledWith(agentResponseBatch);
			expect(mockClient.chatJson).not.toHaveBeenCalled();
		});

		it("cancels a pending idle follow-up and answers the returning user on a fresh clock", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: null },
				messages: [
					{ id: 1, role: "user", content: "First", llmMetadata: null },
					{ id: 2, role: "assistant", content: "Salut !", llmMetadata: null },
				],
			});
			mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({ id: 11, kind: "follow_up", status: "pending", inputVersion: 1 });
			const updates: { setArgs: unknown[] }[] = [];
			mockDb.update.mockImplementation(
				() =>
					({
						set: vi.fn((...setArgs: unknown[]) => {
							updates.push({ setArgs });
							return { where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) };
						}),
					}) as unknown as ReturnType<typeof mockDb.update>,
			);
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 999 }]) });
			mockDb.insert.mockImplementation(
				() =>
					({
						values: valuesMock,
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			const result = await submitMessage(123, "Me revoilà", USER_ID);

			expect(result).toEqual({ turnCount: 2, pending: true });
			// the idle nudge is cancelled, not folded into
			expect(updates.some(({ setArgs }) => bareStrings(setArgs).includes("cancelled"))).toBe(true);
			// the new message gets a fresh reply batch at inputVersion 1
			expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "reply", status: "pending", inputVersion: 1, inputMessageId: 999 }));
		});

		it("persists the maxTurns message, completes immediately, and queues a farewell reply when nothing is scheduled", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: 2 },
				messages: [{ id: 1, role: "user", content: "First", llmMetadata: null }],
			});
			const returning = vi.fn().mockResolvedValue([]);
			mockDb.update.mockImplementation(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })) }));
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 999 }]) });
			mockDb.insert.mockImplementation(
				() =>
					({
						values: valuesMock,
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-08-19T12:00:10.000Z"));
			try {
				const result = await submitMessage(123, "Last", USER_ID, "client-2");
				expect(result).toEqual({ turnCount: 2, pending: false, sessionCompleted: true, completionReason: "max_turns" });
			} finally {
				vi.useRealTimers();
			}

			expect(valuesMock).toHaveBeenCalledWith(
				expect.objectContaining({
					kind: "reply",
					status: "pending",
					dueAt: new Date("2026-08-19T12:00:12.000Z"),
					inputMessageId: 999,
					inputVersion: 1,
				}),
			);
			expect(mockDb.update).toHaveBeenCalledWith(practiceSession);
		});

		it("keeps an unclaimed batch alive at its sampled time when the turn limit ends a reply-less session", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: 2 },
				messages: [{ id: 1, role: "user", content: "First", llmMetadata: null }],
			});
			mockDb.query.agentResponseBatch.findMany.mockResolvedValue([{ id: 11, status: "pending" }]);
			const updates: { setArgs: unknown[]; whereArgs: unknown[] }[] = [];
			mockDb.update.mockImplementation(
				() =>
					({
						set: vi.fn((...setArgs: unknown[]) => ({
							where: vi.fn((...whereArgs: unknown[]) => {
								updates.push({ setArgs, whereArgs });
								return { returning: vi.fn().mockResolvedValue([]) };
							}),
						})),
					}) as unknown as ReturnType<typeof mockDb.update>,
			);
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 999 }]) });
			mockDb.insert.mockImplementation(
				() =>
					({
						values: valuesMock,
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			const result = await submitMessage(123, "Last", USER_ID, "client-2");

			expect(result).toEqual({ turnCount: 2, pending: false, sessionCompleted: true, completionReason: "max_turns" });
			// the unclaimed batch itself is spared, so no farewell batch is queued either
			expect(valuesMock).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "reply" }));
			const cancelUpdate = updates.find(({ setArgs }) => bareStrings(setArgs).includes("cancelled"));
			expect(cancelUpdate).toBeDefined();
			const whereStrings = bareStrings(cancelUpdate?.whereArgs ?? []);
			expect(whereStrings).toContain("stale");
			expect(whereStrings).not.toContain("pending");
		});

		it("cancels the unclaimed batch when the agent already replied in the session", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: 2 },
				messages: [
					{ id: 1, role: "user", content: "First", llmMetadata: null },
					{ id: 2, role: "assistant", content: "Salut !", llmMetadata: null },
				],
			});
			mockDb.query.agentResponseBatch.findMany.mockResolvedValue([{ id: 11, status: "pending" }]);
			const updates: { setArgs: unknown[]; whereArgs: unknown[] }[] = [];
			mockDb.update.mockImplementation(
				() =>
					({
						set: vi.fn((...setArgs: unknown[]) => ({
							where: vi.fn((...whereArgs: unknown[]) => {
								updates.push({ setArgs, whereArgs });
								return { returning: vi.fn().mockResolvedValue([]) };
							}),
						})),
					}) as unknown as ReturnType<typeof mockDb.update>,
			);
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 999 }]) });
			mockDb.insert.mockImplementation(
				() =>
					({
						values: valuesMock,
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			await submitMessage(123, "Last", USER_ID, "client-2");

			const cancelUpdate = updates.find(({ setArgs }) => bareStrings(setArgs).includes("cancelled"));
			expect(cancelUpdate).toBeDefined();
			const whereStrings = bareStrings(cancelUpdate?.whereArgs ?? []);
			expect(whereStrings).toEqual(expect.arrayContaining(["pending", "stale"]));
			expect(valuesMock).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "reply" }));
		});

		it("keeps already-composed replies deliverable when the maxTurns message completes the session", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: 2 },
				messages: [{ id: 1, role: "user", content: "First", llmMetadata: null }],
			});
			const updates: { setArgs: unknown[][]; whereArgs: unknown[][] }[] = [];
			const strings: string[] = [];
			const stringLists: string[][] = [];
			const seen = new Set<unknown>();
			const collect = (value: unknown): void => {
				if (typeof value === "string") {
					strings.push(value);
					return;
				}
				if (Array.isArray(value)) {
					if (value.length > 0 && value.every((item) => typeof item === "string")) {
						stringLists.push(value as string[]);
						return;
					}
					value.forEach(collect);
					return;
				}
				if (value && typeof value === "object") {
					if (seen.has(value)) return;
					seen.add(value);
					Object.values(value).forEach(collect);
				}
			};
			mockDb.update.mockImplementation(
				() =>
					({
						set: vi.fn((...setArgs: unknown[]) => ({
							where: vi.fn((...whereArgs: unknown[]) => {
								updates.push({ setArgs: [setArgs], whereArgs: [whereArgs] });
								return { returning: vi.fn().mockResolvedValue([]) };
							}),
						})),
					}) as unknown as ReturnType<typeof mockDb.update>,
			);

			await submitMessage(123, "Last", USER_ID, "client-2");

			const batchCancel = updates.find(({ setArgs, whereArgs }) => {
				strings.length = 0;
				stringLists.length = 0;
				seen.clear();
				collect(setArgs);
				if (!strings.includes("cancelled")) return false;
				strings.length = 0;
				stringLists.length = 0;
				seen.clear();
				collect(whereArgs);
				// the cancel list covers batches still waiting or generating, but not a
				// reply the agent already composed (delivery_pending stays deliverable)
				return stringLists.some((list) => list.includes("pending"));
			});
			expect(batchCancel).toBeDefined();
			strings.length = 0;
			stringLists.length = 0;
			seen.clear();
			collect(batchCancel?.whereArgs ?? []);
			// bare strings = the inArray params (pgEnum value arrays are collected
			// separately as stringLists, so they cannot mask this assertion)
			expect(strings).toEqual(expect.arrayContaining(["pending", "stale"]));
			expect(strings).not.toContain("delivery_pending");
			expect(strings).not.toContain("processing");
		});

		it("revives a failed user message on manual retry instead of returning pending", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: 3 },
				messages: [{ id: 9, role: "user", content: "Hello", llmMetadata: { clientMessageId: "client-1", failed: true, failureError: "boom" } }],
			});
			mockDb.query.agentResponseBatch.findFirst.mockResolvedValue(null);

			const result = await submitMessage(123, "Hello", USER_ID, "client-1");

			expect(result).toEqual({ turnCount: 1, pending: true });
			// the failure flag was cleared and a fresh batch was scheduled for the same message
			expect(mockDb.update).toHaveBeenCalledWith(sessionMessage);
			expect(mockDb.insert).toHaveBeenCalledWith(agentResponseBatch);
		});

		it("keeps the anchored due time when burst messages retarget a pending batch", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: null },
				messages: [],
			});
			mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
				id: 11,
				sessionId: 123,
				status: "pending",
				dueAt: new Date("2026-08-19T12:00:30.000Z"),
				inputMessageId: 12,
				inputVersion: 1,
			});
			const setMock = vi.fn().mockReturnValue({ where: vi.fn() });
			mockDb.update.mockImplementation(
				() =>
					({
						set: setMock,
						where: vi.fn(),
					}) as unknown as ReturnType<typeof mockDb.update>,
			);
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-08-19T12:00:10.000Z"));
			try {
				await submitMessage(123, "second burst message", USER_ID);
			} finally {
				vi.useRealTimers();
			}

			expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", inputMessageId: 999, inputVersion: 2 }));
			expect(setMock).not.toHaveBeenCalledWith(expect.objectContaining({ dueAt: expect.any(Date) }));
		});

		it("locks the session row before reading state so concurrent submissions serialize", async () => {
			const order: string[] = [];
			mockDb.select.mockImplementation(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						for: (strength: string) => {
							order.push(`lock:${strength}`);
							return Promise.resolve([{ id: 123 }]);
						},
					})),
				})),
			}));
			mockDb.query.practiceSession.findFirst.mockImplementation(async () => {
				order.push("read-session");
				return {
					id: 123,
					userId: USER_ID,
					status: "in_progress",
					task: { urgency: "high", maxTurns: null },
					messages: [],
				};
			});
			mockDb.query.agentResponseBatch.findFirst.mockResolvedValue(null);

			const result = await submitMessage(123, "Hello", USER_ID);

			expect(result).toEqual({ turnCount: 1, pending: true });
			expect(order[0]).toBe("lock:update");
			expect(order.indexOf("read-session")).toBeGreaterThan(order.indexOf("lock:update"));
		});

		it("throws when the session row lock finds no owned session", async () => {
			mockDb.select.mockImplementation(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						for: vi.fn().mockResolvedValue([]),
					})),
				})),
			}));

			await expect(submitMessage(123, "Hello", USER_ID)).rejects.toThrow("Session not found");
			expect(mockDb.query.practiceSession.findFirst).not.toHaveBeenCalled();
		});

		it("cancels the interrupted batch before its deliveries so lock order matches the delivery worker", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: null },
				messages: [],
			});
			mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
				id: 11,
				sessionId: 123,
				status: "delivery_pending",
				inputVersion: 4,
			});
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 999 }]) });
			mockDb.insert.mockImplementation(
				() =>
					({
						values: valuesMock,
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			await submitMessage(123, "too late", USER_ID);

			// session -> batch -> delivery lock order, matching the worker's delivery transaction:
			// the interrupted batch is cancelled before its queued deliveries
			const updateTables = mockDb.update.mock.calls.map((call) => call[0]);
			expect(updateTables[0]).toBe(agentResponseBatch);
			expect(updateTables[1]).toBe(agentDelivery);
		});

		it("re-engages quickly instead of resampling when a message interrupts a pending delivery", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { urgency: "high", maxTurns: null },
				messages: [],
			});
			mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
				id: 11,
				sessionId: 123,
				status: "delivery_pending",
				inputVersion: 4,
			});
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 999 }]) });
			mockDb.insert.mockImplementation(
				() =>
					({
						values: valuesMock,
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-08-19T12:00:10.000Z"));
			try {
				await submitMessage(123, "too late", USER_ID);
			} finally {
				vi.useRealTimers();
			}

			expect(valuesMock).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "pending",
					dueAt: new Date("2026-08-19T12:00:12.000Z"),
					inputVersion: 5,
				}),
			);
		});
	});

	describe("submitMessage on arrival-based surfaces", () => {
		const now = new Date("2026-08-21T12:00:00.000Z");

		/** Select double: plain count/delivered queries resolve to `rows`, the row lock resolves locked. */
		const mockAsyncSelect = (rows: unknown[] = []) => {
			mockDb.select.mockImplementation(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() =>
						Object.assign(Promise.resolve(rows), {
							for: vi.fn().mockResolvedValue([{ id: 123, status: "in_progress" }]),
						}),
					),
				})),
			}));
		};

		const mailTask = {
			id: 1,
			ui: "apple_mail" as const,
			language: "en" as const,
			urgency: "high" as const,
			maxTurns: null,
			openingState: { counterpartName: "Maya <maya@x.example>", emails: [] },
		};
		const redditTask = {
			id: 1,
			ui: "reddit" as const,
			language: "en" as const,
			urgency: "high" as const,
			maxTurns: null,
			openingState: {
				post: { author: "op" },
				previousComments: [
					{ id: "c1", author: "alex", text: "Voice scams." },
					{ id: "c2", author: "luma", text: "Other branch." },
				],
			},
		};

		it("gives a one-to-one mail message exactly one taker — the counterpart — on a sampled clock", async () => {
			mockAsyncSelect();
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: mailTask,
				messages: [],
			});
			mockDb.query.agentResponseBatch.findMany.mockResolvedValue([]);
			const inserts: Record<string, unknown>[] = [];
			mockDb.insert.mockImplementation(
				() =>
					({
						values: vi.fn((values: Record<string, unknown>) => {
							inserts.push(values);
							return { returning: vi.fn().mockResolvedValue([{ id: 999 }]) };
						}),
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			vi.useFakeTimers();
			vi.setSystemTime(now);
			try {
				const result = await submitMessage(123, "To: Maya\nSubject: Hi\n\nHello", USER_ID, "client-1");
				expect(result).toEqual({ turnCount: 1, pending: true });
			} finally {
				vi.useRealTimers();
			}

			const takers = inserts.filter((insert) => insert.kind === "reply");
			expect(takers).toHaveLength(1);
			expect(takers[0]).toMatchObject({
				kind: "reply",
				status: "pending",
				participant: "Maya",
				inputMessageId: 999,
				inputVersion: 1,
				targetRef: null,
				attempt: 0,
			});
			// the message itself carries the arrival marker, so its wait settles within its conversation
			const message = inserts.find((insert) => insert.kind === undefined);
			expect(message?.llmMetadata).toMatchObject({ clientMessageId: "client-1", arrival: true });
			expect((takers[0]?.dueAt as Date).getTime()).toBeGreaterThan(now.getTime());
		});

		it("re-targets a joined mail conversation's takers and folds the earlier head", async () => {
			mockAsyncSelect();
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: mailTask,
				messages: [{ id: 1, role: "user", content: "To: Maya\nSubject: Hi\n\nHello", createdAt: now, llmMetadata: { clientMessageId: "m1" } }],
			});
			mockDb.query.agentResponseBatch.findMany
				.mockResolvedValueOnce([{ id: 11, targetRef: null, inputMessageId: 1, participant: "Maya" }])
				.mockResolvedValue([{ id: 11, status: "completed" }]);
			const updates: { table: unknown; setArgs: unknown[]; whereArgs: unknown[] }[] = [];
			mockDb.update.mockImplementation(
				(table: unknown) =>
					({
						set: vi.fn((...setArgs: unknown[]) => ({
							where: vi.fn((...whereArgs: unknown[]) => {
								updates.push({ table, setArgs, whereArgs });
								return { returning: vi.fn().mockResolvedValue([]) };
							}),
						})),
					}) as unknown as ReturnType<typeof mockDb.update>,
			);
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 999 }]) });
			mockDb.insert.mockImplementation(() => ({ values: valuesMock }));

			await submitMessage(123, "To: Maya\nSubject: Re: Hi\n\nActually one more thing", USER_ID, "m2");

			// the pending taker now serves the new head, on its unchanged clock
			const reTarget = updates.find(
				(update) => update.table === agentResponseBatch && (update.setArgs[0] as { inputMessageId?: number }).inputMessageId === 999,
			);
			expect(reTarget).toBeDefined();
			expect(bareStrings(reTarget?.whereArgs ?? [])).toContain("reply");
			// the earlier head folded into the new message
			const fold = updates.find(
				(update) =>
					update.table === sessionMessage && (update.setArgs[0] as { llmMetadata?: { foldedInto?: number } }).llmMetadata?.foldedInto === 999,
			);
			expect(fold).toBeDefined();
			// a supplement adds no takers of its own
			expect(valuesMock).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "reply" }));
		});

		it("keeps a composing taker's head independent: no fold, its own outcome", async () => {
			mockAsyncSelect();
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: mailTask,
				messages: [{ id: 1, role: "user", content: "To: Maya\nSubject: Hi\n\nHello", createdAt: now, llmMetadata: { clientMessageId: "m1" } }],
			});
			// the conversation's only taker is composing: not re-targetable, so nothing joins
			mockDb.query.agentResponseBatch.findMany.mockResolvedValue([]);
			const updates: { table: unknown; setArgs: unknown[] }[] = [];
			mockDb.update.mockImplementation(
				(table: unknown) =>
					({
						set: vi.fn((...setArgs: unknown[]) => {
							updates.push({ table, setArgs });
							return { where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) };
						}),
					}) as unknown as ReturnType<typeof mockDb.update>,
			);

			await submitMessage(123, "To: Maya\nSubject: Re: Hi\n\nOne more thing", USER_ID, "m2");

			expect(
				updates.some(
					(update) =>
						update.table === sessionMessage && (update.setArgs[0] as { llmMetadata?: { foldedInto?: number } }).llmMetadata?.foldedInto !== undefined,
				),
			).toBe(false);
		});

		it("opens a reddit exchange with a taker set pinned to its conversation target", async () => {
			const allocate = vi.spyOn(floor, "allocateParticipants");
			mockAsyncSelect();
			const random = vi.spyOn(globalThis.Math, "random").mockReturnValue(0.9);
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: redditTask,
				messages: [],
				expiresAt: new Date(now.getTime() + 3_600_000),
			});
			mockDb.query.agentResponseBatch.findMany.mockResolvedValue([]);
			const inserts: Record<string, unknown>[] = [];
			mockDb.insert.mockImplementation(
				() =>
					({
						values: vi.fn((values: Record<string, unknown>) => {
							inserts.push(values);
							return { returning: vi.fn().mockResolvedValue([{ id: 999 }]) };
						}),
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			await submitMessage(123, "Same here", USER_ID, "m1", {
				userMetadata: { thread: { commentId: "reddit-user-m1", targetCommentId: "c1" } },
			});

			expect(allocate.mock.calls[0][0].target).toMatchObject({ role: "learner", text: "Same here" });
			allocate.mockRestore();
			const takers = inserts.filter((insert) => insert.kind === "reply");
			expect(takers.length).toBeGreaterThanOrEqual(1);
			for (const taker of takers) {
				expect(taker).toMatchObject({ kind: "reply", status: "pending", targetRef: "c1", attempt: 0, inputMessageId: 999 });
				expect(typeof taker.participant).toBe("string");
			}
			// distinct participants on independently sampled clocks
			const participants = new Set(takers.map((taker) => taker.participant));
			expect(participants.size).toBe(takers.length);
			// the world overlap did not fire this draw
			expect(inserts.some((insert) => insert.kind === "world")).toBe(false);
			random.mockRestore();
		});

		it("may overlap the pending reply wave with one world moment", async () => {
			mockAsyncSelect();
			const random = vi.spyOn(globalThis.Math, "random").mockReturnValue(0.1);
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: redditTask,
				messages: [],
				expiresAt: new Date(now.getTime() + 3_600_000),
			});
			mockDb.query.agentResponseBatch.findMany.mockResolvedValue([]);
			const inserts: Record<string, unknown>[] = [];
			mockDb.insert.mockImplementation(
				() =>
					({
						values: vi.fn((values: Record<string, unknown>) => {
							inserts.push(values);
							return { returning: vi.fn().mockResolvedValue([{ id: 999 }]) };
						}),
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			vi.useFakeTimers();
			vi.setSystemTime(now);
			try {
				await submitMessage(123, "Same here", USER_ID, "m1", {
					userMetadata: { thread: { commentId: "reddit-user-m1", targetCommentId: "c1" } },
				});
			} finally {
				vi.useRealTimers();
			}

			const world = inserts.find((insert) => insert.kind === "world");
			expect(world).toMatchObject({ status: "pending", inputMessageId: null, sessionId: 123 });
			expect(typeof world?.participant).toBe("string");
			random.mockRestore();
		});

		it("retries with exactly one fresh taker at the bumped attempt, excluding delivered participants", async () => {
			mockAsyncSelect([{ batchId: 11 }]);
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: redditTask,
				messages: [
					{
						id: 1,
						role: "user",
						content: "anyone?",
						createdAt: now,
						llmMetadata: {
							clientMessageId: "m1",
							failed: true,
							failureError: "boom",
							thread: { commentId: "reddit-user-m1", targetCommentId: null },
						},
					},
				],
				expiresAt: new Date(now.getTime() + 3_600_000),
			});
			mockDb.query.agentResponseBatch.findMany
				.mockResolvedValueOnce([]) // no conversation is pending
				.mockResolvedValue([{ id: 11, participant: "alex" }]); // who already served the message
			const updates: { table: unknown; setArgs: unknown[]; whereArgs: unknown[] }[] = [];
			mockDb.update.mockImplementation(
				(table: unknown) =>
					({
						set: vi.fn((...setArgs: unknown[]) => ({
							where: vi.fn((...whereArgs: unknown[]) => {
								updates.push({ table, setArgs, whereArgs });
								return { returning: vi.fn().mockResolvedValue([]) };
							}),
						})),
					}) as unknown as ReturnType<typeof mockDb.update>,
			);
			const inserts: Record<string, unknown>[] = [];
			mockDb.insert.mockImplementation(
				() =>
					({
						values: vi.fn((values: Record<string, unknown>) => {
							inserts.push(values);
							return { returning: vi.fn().mockResolvedValue([{ id: 999 }]) };
						}),
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			const result = await submitMessage(123, "anyone?", USER_ID, "m1", {
				userMetadata: { thread: { commentId: "reddit-user-m1", targetCommentId: null } },
			});

			expect(result).toEqual({ turnCount: 1, pending: true });
			// the failure clears, the attempt counter moves, and a pre-marker message gains the arrival flag
			const revival = updates.find(
				(update) => update.table === sessionMessage && (update.setArgs[0] as { llmMetadata?: { attempt?: number } }).llmMetadata?.attempt === 1,
			);
			expect(revival).toBeDefined();
			expect((revival?.setArgs[0] as { llmMetadata?: { arrival?: boolean } }).llmMetadata?.arrival).toBe(true);
			expect((revival?.setArgs[0] as { llmMetadata?: { failed?: boolean } }).llmMetadata?.failed).toBe(false);
			const takers = inserts.filter((insert) => insert.kind === "reply");
			expect(takers).toHaveLength(1);
			expect(takers[0]).toMatchObject({ kind: "reply", attempt: 1, inputMessageId: 1, targetRef: "reddit-user-m1" });
			expect(takers[0]?.participant).not.toBe("alex");
		});

		it("keeps the joined conversation's target for a participant the supplement addresses", async () => {
			mockAsyncSelect();
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: redditTask,
				messages: [
					{
						id: 1,
						role: "user",
						content: "Same here",
						createdAt: now,
						llmMetadata: { clientMessageId: "m1", thread: { commentId: "reddit-user-m1", targetCommentId: "c1" } },
					},
				],
				expiresAt: new Date(now.getTime() + 3_600_000),
			});
			mockDb.query.agentResponseBatch.findMany
				.mockResolvedValueOnce([{ id: 11, targetRef: "c1", inputMessageId: 1, participant: "alex" }])
				.mockResolvedValue([{ id: 11, status: "completed" }]);
			const inserts: Record<string, unknown>[] = [];
			mockDb.insert.mockImplementation(
				() =>
					({
						values: vi.fn((values: Record<string, unknown>) => {
							inserts.push(values);
							return { returning: vi.fn().mockResolvedValue([{ id: 999 }]) };
						}),
					}) as unknown as ReturnType<typeof mockDb.insert>,
			);

			// a supplement answering their own message, naming luma, joins the c1 conversation
			await submitMessage(123, "@luma right?", USER_ID, "m2", {
				userMetadata: { thread: { commentId: "reddit-user-m2", targetCommentId: "reddit-user-m1" } },
			});

			const added = inserts.find((insert) => insert.participant === "luma");
			expect(added).toMatchObject({ kind: "reply", targetRef: "c1", inputMessageId: 999, attempt: 0 });
		});

		it("still queues the farewell when only world comments ever landed at max turns", async () => {
			mockAsyncSelect();
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { ...redditTask, maxTurns: 1 },
				messages: [
					{
						id: 1,
						role: "user",
						content: "Anyone here?",
						createdAt: now,
						llmMetadata: { clientMessageId: "m1", thread: { commentId: "reddit-user-m1", targetCommentId: null } },
					},
					{ id: 5, role: "assistant", content: "meanwhile", createdAt: now, llmMetadata: { asyncDelivery: true }, responseBatchId: 12 },
				],
			});
			// no outstanding batches; the only delivered message came from a world moment
			mockDb.query.agentResponseBatch.findMany.mockResolvedValueOnce([]).mockResolvedValue([{ id: 12, kind: "world" }]);
			mockDb.update.mockImplementation(
				() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })) }) as never,
			);
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 999 }]) });
			mockDb.insert.mockImplementation(() => ({ values: valuesMock }) as never);

			const result = await submitMessage(123, "Last", USER_ID, "m2", {
				userMetadata: { thread: { commentId: "reddit-user-m2", targetCommentId: null } },
			});

			expect(result).toEqual({ turnCount: 2, pending: false, sessionCompleted: true, completionReason: "max_turns" });
			const farewell = valuesMock.mock.calls.find((args) => (args[0] as { kind?: string }).kind === "reply");
			expect(farewell?.[0]).toMatchObject({ status: "pending", inputMessageId: 999, targetRef: "reddit-user-m2" });
		});

		it("ends world activity at max turns while sparing the reply a never-replied session is owed", async () => {
			mockAsyncSelect();
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				status: "in_progress",
				task: { ...redditTask, maxTurns: 1 },
				messages: [],
			});
			// a pending reply taker, and a world moment already delivering
			mockDb.query.agentResponseBatch.findMany.mockResolvedValue([
				{ id: 11, status: "pending", kind: "reply" },
				{ id: 12, status: "delivery_pending", kind: "world" },
			]);
			const updates: { table: unknown; setArgs: unknown[]; whereArgs: unknown[] }[] = [];
			mockDb.update.mockImplementation(
				(table: unknown) =>
					({
						set: vi.fn((...setArgs: unknown[]) => ({
							where: vi.fn((...whereArgs: unknown[]) => {
								updates.push({ table, setArgs, whereArgs });
								return { returning: vi.fn().mockResolvedValue([]) };
							}),
						})),
					}) as unknown as ReturnType<typeof mockDb.update>,
			);

			const result = await submitMessage(123, "Anyone here?", USER_ID, "m1");

			expect(result).toEqual({ turnCount: 1, pending: false, sessionCompleted: true, completionReason: "max_turns" });
			const worldCancel = updates.find((update) => update.table === agentResponseBatch && bareStrings(update.whereArgs).includes("world"));
			expect(worldCancel).toBeDefined();
			// the world moment's queued deliveries are cancelled with it
			expect(updates.some((update) => update.table === agentDelivery && bareStrings(update.setArgs).includes("cancelled"))).toBe(true);
			// the pending reply taker is spared: only stale reply batches were in scope to cancel
			const replyCancels = updates.filter(
				(update) =>
					update.table === agentResponseBatch &&
					!bareStrings(update.whereArgs).includes("world") &&
					bareStrings(update.setArgs).includes("cancelled"),
			);
			for (const cancel of replyCancels) expect(bareStrings(cancel.whereArgs)).toEqual(expect.arrayContaining(["stale"]));
		});
	});

	describe("completeSession", () => {
		const mockSession = {
			id: 123,
			status: "in_progress",
			taskId: 1,
			userId: USER_ID,
		};

		const mockTaskObjectives = {
			id: 1,
			language: "en",
			objectives: ["Use polite language", "Respond appropriately"],
		};

		it("marks session as completed and returns feedback", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(mockSession).mockResolvedValueOnce({
				...mockSession,
				messages: [
					{ role: "user", content: "Hello", llmMetadata: { mailBodyHtml: '<div style="text-align: center">Hello</div>' } },
					{ role: "assistant", content: "Hi there" },
				],
				task: mockTaskObjectives,
			});
			const whereMock = vi.fn();
			mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: whereMock }) });

			mockClient.chatJson.mockResolvedValue({
				value: {
					summary: "Good job!",
					grammar: [],
					vocabulary: [],
					coherence: [],
					objectiveResults: [
						{ text: "Use polite language", grade: "A" },
						{ text: "Respond appropriately", grade: "B" },
					],
				},
			});

			await completeSession(123);

			// Verify session was marked as completed
			expect(mockDb.update).toHaveBeenCalledWith(practiceSession);
			expect(mockDb.update(undefined).set).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "completed",
					completedAt: expect.any(Date),
				}),
			);
		});

		it("marks session as completed for mail tasks", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [
					{
						role: "assistant",
						content: "Please send an update.",
					},
					{
						role: "user",
						content: "To: Maya\nSubject: Update\n\nHello Maya,\nI finished the draft.",
						llmMetadata: { mailBodyHtml: "<div>Hello Maya,</div><div>I finished the draft.</div>" },
					},
					{
						role: "assistant",
						content: "Could you include next steps?",
					},
					{
						role: "user",
						content: "To: Maya\nSubject: Re: Update\n\nI will send the final version tomorrow.",
					},
				],
				task: mockTaskObjectives,
			});

			await completeSession(123);

			// Verify session was marked as completed
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("handles empty objectives", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(mockSession).mockResolvedValueOnce({
				...mockSession,
				messages: [],
				task: { ...mockTaskObjectives, objectives: [] },
			});
			const whereMock = vi.fn();
			mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: whereMock }) });

			mockClient.chatJson.mockResolvedValue({
				value: {
					summary: "General fluency assessment here.",
					grammar: [],
					vocabulary: [],
					coherence: [],
					objectiveResults: [],
				},
			});

			await completeSession(123);

			// Verify session was marked as completed
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("throws when session not found", async () => {
			mockLockedSessionRow([]);

			await expect(completeSession(999)).rejects.toThrow("Session not found");
		});

		it("reads the status under a row lock before writing the completion", async () => {
			const forMock = mockLockedSessionRow([{ id: 123, status: "in_progress" }]);

			await completeSession(123);

			expect(forMock).toHaveBeenCalledWith("update");
		});

		// max_turns (the final send), the expiry sweep, and abuse termination all end
		// sessions concurrently under the same row lock. Whichever committed first owns
		// the outcome: a later "end practice" click must not relabel a max_turns
		// completion (the worker reads that reason to spare the final reply) nor
		// resurrect an abandoned session as completed.
		it.each(["completed", "evaluated", "abandoned"])("refuses to overwrite a session already %s", async (status) => {
			mockLockedSessionRow([{ id: 123, status }]);

			await expect(completeSession(123)).rejects.toThrow("Session not in progress");
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});

	describe("getSessionOrFail", () => {
		it("returns session when userId and taskId match", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: "u1",
				taskId: 456,
			});

			const session = await getSessionOrFail(123, "u1", 456);
			expect(session).toEqual({ id: 123, userId: "u1", taskId: 456 });
		});

		it("returns null when session not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			const session = await getSessionOrFail(999, "u1", 456);
			expect(session).toBeNull();
		});

		it("returns null when userId does not match", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: "other-user",
				taskId: 456,
			});

			const session = await getSessionOrFail(123, "u1", 456);
			expect(session).toBeNull();
		});

		it("returns null when taskId does not match", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: "u1",
				taskId: 999,
			});

			const session = await getSessionOrFail(123, "u1", 456);
			expect(session).toBeNull();
		});
	});
});
