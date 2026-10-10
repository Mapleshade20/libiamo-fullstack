import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		transaction: vi.fn(),
		query: {
			agentDelivery: { findMany: vi.fn() },
			agentResponseBatch: { findFirst: vi.fn() },
		},
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));

import { URGENCY_PRESETS } from "$lib/constants";
import { getDeliveryDelayMs } from "$lib/practice/reply-timing";
import { agentDelivery, agentResponseBatch, practiceSession, sessionMessage } from "$lib/server/db/schema";
import type { AgentGenerationArtifacts } from "$lib/server/practice/agent-replies/generator";
import {
	AgentReplyWorker,
	buildDeliveredReplyMetadata,
	getBatchGenerationEvent,
	getDeliveryDueAt,
	getUrgencyFollowUpAt,
	hasEndedByMaxTurns,
	isStaleGeneration,
	isUnwatchedTick,
	LIVE_CHAT_TICKS,
	MAX_GENERATION_ATTEMPTS,
	scheduleWorldMoment,
	settleUserMessageFlags,
	shouldDeliverIntoEndedSession,
	shouldRetryGeneration,
	WORLD_WINDOW_LIMIT,
} from "$lib/server/practice/agent-replies/worker";

afterEach(() => vi.useRealTimers());

/** Collects bare strings from drizzle query args (skipping SQL chunks and enum lists)
 * so where-clause payloads can be asserted precisely. */
function collectBareStrings(value: unknown, out: Array<string | number>): void {
	if (typeof value === "string") {
		out.push(value);
		return;
	}
	if (typeof value === "number") {
		out.push(value);
		return;
	}
	if (Array.isArray(value)) {
		if (value.length > 0 && value.every((item) => typeof item === "string")) return;
		for (const item of value) collectBareStrings(item, out);
		return;
	}
	if (value && typeof value === "object") {
		if ("columnType" in value || "columns" in value) return;
		for (const item of Object.values(value)) collectBareStrings(item, out);
	}
}

const bareStrings = (value: unknown): Array<string | number> => {
	const out: Array<string | number> = [];
	collectBareStrings(value, out);
	return out;
};

type RecordedUpdate = { table: unknown; set: Record<string, unknown>; clause: unknown };
type RecordedInsert = { table: unknown; values: Record<string, unknown> };

/** Executor double for the follow-up scheduler: replays the session row and
 * records any follow-up batch insert. */
function makeFollowUpExecutor(session: Record<string, unknown>) {
	const inserts: RecordedInsert[] = [];
	const executor = {
		query: {
			practiceSession: { findFirst: vi.fn().mockResolvedValue(session) },
			agentResponseBatch: { findFirst: vi.fn().mockResolvedValue(null) },
			user: { findFirst: vi.fn().mockResolvedValue({ name: "Maple" }) },
		},
		update: () => ({
			set: () => ({
				where: () => Object.assign(Promise.resolve(undefined), { returning: async () => [{ id: 1 }] }),
			}),
		}),
		insert: (table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				inserts.push({ table, values });
			},
		}),
	};
	return { executor, inserts };
}

function makeRecordingTx(
	batchId: number,
	siblingBatchIds: number[],
	inputMessageMetadata: unknown = null,
	options: {
		sessionRow?: Record<string, unknown> | null;
		messageRow?: Record<string, unknown> | null;
		siblings?: Array<Record<string, unknown>>;
		userMessages?: Array<Record<string, unknown>>;
		delivered?: Array<{ batchId: number; count: number }>;
	} = {},
) {
	const updates: RecordedUpdate[] = [];
	const inserts: RecordedInsert[] = [];
	const tx = {
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: (clause: unknown) => {
					updates.push({ table, set: values, clause });
					// a real promise (awaitable without .returning) carrying the
					// returning() continuation drizzle chains on the same query
					return Object.assign(Promise.resolve(undefined), {
						returning: async () => [{ id: batchId }],
					});
				},
			}),
		}),
		select: () => ({
			from: (table: unknown) => ({
				where: () =>
					Object.assign(Promise.resolve(table === agentResponseBatch ? siblingBatchIds.map((id) => ({ id })) : []), {
						for: async () =>
							table === practiceSession ? [options.sessionRow] : table === agentResponseBatch ? siblingBatchIds.map((id) => ({ id })) : [],
						groupBy: async () => options.delivered ?? [],
					}),
			}),
		}),
		insert: (table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				inserts.push({ table, values });
			},
		}),
		query: {
			sessionMessage: {
				findFirst: vi.fn().mockResolvedValue(options.messageRow ?? { llmMetadata: inputMessageMetadata }),
				findMany: vi.fn().mockResolvedValue(options.userMessages ?? []),
			},
			agentResponseBatch: { findMany: vi.fn().mockResolvedValue(options.siblings ?? []) },
		},
	};
	return { tx, updates, inserts };
}

type RecordedDeliveryOperation = { kind: string; table: unknown; set?: Record<string, unknown> };

/** Transaction double for the delivery path: records lock/update/insert order and
 * replays fixed rows for the locked session and batch reads. */
function makeDeliveryTx(
	options: {
		sessionRow?: Record<string, unknown> | null;
		batchRow?: Record<string, unknown> | null;
		remainingDelivery?: { id: number } | null;
		deliveredCount?: number;
		worldSession?: Record<string, unknown> | null;
		sessionMessages?: Array<Record<string, unknown>>;
		settleMessage?: Record<string, unknown> | null;
		siblings?: Array<Record<string, unknown>>;
		userMessages?: Array<Record<string, unknown>>;
	} = {},
) {
	const operations: RecordedDeliveryOperation[] = [];
	const sessionRow = options.sessionRow ?? { status: "in_progress", completionReason: null };
	const batchRow = options.batchRow ?? { status: "delivery_pending" };
	const tx = {
		select: () => ({
			from: (table: unknown) => ({
				where: () =>
					Object.assign(
						Promise.resolve(
							table === practiceSession ? [sessionRow] : table === agentResponseBatch ? [batchRow] : [{ count: options.deliveredCount ?? 0 }],
						),
						{
							for: (strength: string) => {
								operations.push({ kind: `lock:${strength}`, table });
								return Promise.resolve(table === practiceSession ? [sessionRow] : [batchRow]);
							},
							groupBy: () => Promise.resolve([{ count: options.deliveredCount ?? 0 }]),
						},
					),
			}),
		}),
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: () => {
					operations.push({ kind: "update", table, set: values });
					return Object.assign(Promise.resolve(undefined), {
						returning: async () => [{ id: 1 }],
					});
				},
			}),
		}),
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				operations.push({ kind: "insert", table, set: values });
				return { onConflictDoNothing: async () => undefined, returning: async () => [{ id: 77 }] };
			},
		}),
		query: {
			sessionMessage: {
				findFirst: vi.fn().mockResolvedValue(options.settleMessage ?? null),
				findMany: vi.fn().mockResolvedValue(options.userMessages ?? options.sessionMessages ?? []),
			},
			agentDelivery: { findFirst: vi.fn().mockResolvedValue(options.remainingDelivery ?? null) },
			practiceSession: { findFirst: vi.fn().mockResolvedValue(options.worldSession ?? null) },
			agentResponseBatch: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue(options.siblings ?? []) },
			user: { findFirst: vi.fn().mockResolvedValue({ name: "Maple" }) },
		},
	};
	return { tx, operations };
}

describe("agent reply worker scheduling", () => {
	beforeEach(() => {
		mockDb.transaction.mockReset();
	});
	it("spaces multiple deliveries using content length", () => {
		const first = new Date("2026-08-19T12:00:00.000Z");
		const next = getDeliveryDueAt(first, "A short reply.");
		expect(next.getTime()).toBeGreaterThan(first.getTime());
		expect(getDeliveryDueAt(first, undefined)).toEqual(first);
	});

	it("marks only follow_up batches as idle-nudge events, carrying the nudge count", () => {
		expect(getBatchGenerationEvent("reply", 1)).toEqual({ kind: "reply" });
		expect(getBatchGenerationEvent("follow_up", 2)).toEqual({ kind: "follow_up", followUpCount: 2 });
		expect(getBatchGenerationEvent("world", 0)).toEqual({ kind: "world" });
	});

	it("uses urgency-specific idle follow-up windows", () => {
		const now = new Date("2026-08-19T12:00:00.000Z");
		expect(getUrgencyFollowUpAt(now, "high", 1).getTime()).toBe(now.getTime() + 60 * 60 * 1000);
		expect(getUrgencyFollowUpAt(now, "low", 2).getTime()).toBe(now.getTime() + 48 * 60 * 60 * 1000);
	});

	it("marks newer user input and completed sessions stale", () => {
		expect(isStaleGeneration({ expectedInputMessageId: 4, latestUserMessageId: 5, sessionStatus: "in_progress" })).toBe(true);
		expect(isStaleGeneration({ expectedInputMessageId: 4, latestUserMessageId: 4, sessionStatus: "completed" })).toBe(true);
		expect(isStaleGeneration({ expectedInputMessageId: 4, latestUserMessageId: 4, sessionStatus: "in_progress" })).toBe(false);
	});

	it("only delivers into ended sessions when a max_turns reply is already composed", () => {
		expect(shouldDeliverIntoEndedSession({ status: "in_progress", completionReason: null }, "delivery_pending")).toBe(true);
		expect(shouldDeliverIntoEndedSession(null, "delivery_pending")).toBe(false);
		expect(shouldDeliverIntoEndedSession({ status: "completed", completionReason: "max_turns" }, "delivery_pending")).toBe(true);
		// the feedback page can flip a max_turns session to "evaluated" while a spared
		// batch is still generating; the reply must still be delivered (QA race)
		expect(shouldDeliverIntoEndedSession({ status: "evaluated", completionReason: "max_turns" }, "delivery_pending")).toBe(true);
		expect(hasEndedByMaxTurns({ status: "evaluated", completionReason: "user_requested" })).toBe(false);
		expect(shouldDeliverIntoEndedSession({ status: "completed", completionReason: "max_turns" }, "pending")).toBe(false);
		expect(shouldDeliverIntoEndedSession({ status: "completed", completionReason: "user_requested" }, "delivery_pending")).toBe(false);
		expect(shouldDeliverIntoEndedSession({ status: "completed", completionReason: "max_session_age" }, "delivery_pending")).toBe(false);
		// the abuse-terminating batch keeps its parting reply after the session ends,
		// including when the feedback page has already flipped it to evaluated
		expect(shouldDeliverIntoEndedSession({ status: "completed", completionReason: "terminated_abuse" }, "delivery_pending")).toBe(true);
		expect(shouldDeliverIntoEndedSession({ status: "evaluated", completionReason: "terminated_abuse" }, "delivery_pending")).toBe(true);
		expect(shouldDeliverIntoEndedSession({ status: "abandoned", completionReason: "terminated_abuse" }, "delivery_pending")).toBe(true);
		expect(shouldDeliverIntoEndedSession({ status: "completed", completionReason: "terminated_abuse" }, "pending")).toBe(false);
		// ambient activity ends with the learner's turn, whatever ended the session —
		// but a world moment still lands while the session is in progress
		expect(shouldDeliverIntoEndedSession({ status: "in_progress", completionReason: null }, "delivery_pending", "world")).toBe(true);
		expect(shouldDeliverIntoEndedSession({ status: "completed", completionReason: "max_turns" }, "delivery_pending", "world")).toBe(false);
	});

	it("stores a delivered message's author and what it answers the way each surface reads it", () => {
		expect(buildDeliveredReplyMetadata("ao3", { author: "HikariKitsune02", replyTo: "ao3-user-msg-1" }, 501)).toEqual({
			assistantAuthorName: "HikariKitsune02",
			thread: { parentCommentId: "ao3-user-msg-1" },
			inputMessageId: 501,
			asyncDelivery: true,
		});
		expect(buildDeliveredReplyMetadata("discord", { author: "zote", replyTo: "opening-2" }, 501)).toEqual({
			assistantAuthorName: "zote",
			replyTo: "opening-2",
			asyncDelivery: true,
		});
		// a top-level comment, a reply queued before deliveries had authors, and a world moment (no message of its own)
		expect(buildDeliveredReplyMetadata("reddit", { author: null, replyTo: null }, null)).toEqual({ inputMessageId: null, asyncDelivery: true });
	});

	it("bounds generation retries per batch", () => {
		expect(MAX_GENERATION_ATTEMPTS).toBe(3);
		expect(shouldRetryGeneration(1)).toBe(true);
		expect(shouldRetryGeneration(2)).toBe(true);
		expect(shouldRetryGeneration(3)).toBe(false);
		expect(shouldRetryGeneration(99)).toBe(false);
	});

	it("ends the session and cancels sibling batches immediately when termination carries a final reply", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		const batch = {
			id: 31,
			sessionId: 5,
			claimToken: "token-31",
			status: "processing",
			generationCount: 1,
			inputMessageId: 501,
		} as Parameters<AgentReplyWorker["persistGenerationOutcome"]>[0];
		const result = {
			requestMessages: [],
			rawResponse: "",
			parsedResult: {
				decision: "terminate_abuse",
				deliveries: [{ author: "Mario", replyTo: null, content: "Je dois couper court à cette conversation." }],
				allowIdleFollowUp: false,
				terminationReason: "Severe abuse",
			},
			providerMetadata: { finishReason: "stop" },
		} as unknown as AgentGenerationArtifacts;

		const { tx, updates, inserts } = makeRecordingTx(31, [29, 30]);
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});
		await (worker as unknown as { persistGenerationOutcome: (b: unknown, r: unknown, n: Date) => Promise<void> }).persistGenerationOutcome(
			batch,
			result,
			now,
		);

		// the terminating batch itself is queued for delivery, never cancelled
		const fenceUpdate = updates.find((update) => update.table === agentResponseBatch && update.set.status === "delivery_pending");
		expect(fenceUpdate).toBeDefined();
		expect(inserts).toEqual([
			{
				table: agentDelivery,
				values: { batchId: 31, sequence: 0, content: "Je dois couper court à cette conversation.", author: "Mario", replyTo: null, dueAt: now },
			},
		]);

		// the session ends at decision time, not when the final reply lands
		const sessionUpdate = updates.find((update) => update.table === practiceSession);
		expect(sessionUpdate?.set).toMatchObject({ status: "abandoned", completionReason: "terminated_abuse" });

		// sibling batches — including ones already mid-delivery — are cancelled now
		const cancelUpdate = updates.find((update) => update.table === agentResponseBatch && update.set.status === "cancelled");
		const cancelStrings = bareStrings(cancelUpdate?.clause);
		expect(cancelStrings).toEqual(expect.arrayContaining(["pending", "processing", "delivery_pending"]));
		expect(cancelStrings).not.toContain("terminated");
		// ... and so are their queued deliveries
		const deliveryCancel = updates.find((update) => update.table === agentDelivery);
		expect(deliveryCancel?.set).toMatchObject({ status: "cancelled" });
		expect(bareStrings(deliveryCancel?.clause)).toEqual(expect.arrayContaining([29, 30, "pending"]));
	});

	it("anchors the delivery timeline at completion and paces each message by its own length", async () => {
		const completedAt = new Date("2026-08-21T12:00:00.000Z");
		const batch = {
			id: 31,
			sessionId: 5,
			claimToken: "token-31",
			status: "processing",
			generationCount: 1,
			inputMessageId: 501,
		} as Parameters<AgentReplyWorker["persistGenerationOutcome"]>[0];
		const result = {
			requestMessages: [],
			rawResponse: "",
			parsedResult: {
				decision: "reply",
				deliveries: [
					{ author: "Mario", replyTo: null, content: "Salut !" },
					{ author: "Mario", replyTo: null, content: "x".repeat(40) },
				],
				allowIdleFollowUp: false,
			},
			providerMetadata: { finishReason: "stop" },
		} as unknown as AgentGenerationArtifacts;

		const { tx, inserts } = makeRecordingTx(31, []);
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});
		await (worker as unknown as { persistGenerationOutcome: (b: unknown, r: unknown, n: Date) => Promise<void> }).persistGenerationOutcome(
			batch,
			result,
			completedAt,
		);

		// the first message is due the moment composing finishes; the wait before the
		// second scales with the second message's own length (typing model)
		expect(inserts[0]?.values.dueAt).toBe(completedAt);
		expect(inserts[1]?.values.dueAt).toEqual(new Date(completedAt.getTime() + getDeliveryDelayMs("x".repeat(40))));
	});

	it("marks the input message terminal when the agent chooses no reply", async () => {
		const completedAt = new Date("2026-08-21T12:00:00.000Z");
		const batch = {
			id: 31,
			sessionId: 5,
			claimToken: "token-31",
			status: "processing",
			generationCount: 1,
			inputMessageId: 501,
		} as Parameters<AgentReplyWorker["persistGenerationOutcome"]>[0];
		const result = {
			requestMessages: [],
			rawResponse: "",
			parsedResult: {
				decision: "no_reply",
				deliveries: [],
				allowIdleFollowUp: false,
			},
			providerMetadata: { finishReason: "stop" },
		} as unknown as AgentGenerationArtifacts;

		const { tx, updates, inserts } = makeRecordingTx(31, [], { clientMessageId: "msg-1", thread: { commentId: "c1" } });
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});
		await (worker as unknown as { persistGenerationOutcome: (b: unknown, r: unknown, n: Date) => Promise<void> }).persistGenerationOutcome(
			batch,
			result,
			completedAt,
		);

		const messageUpdate = updates.find((update) => update.table === sessionMessage);
		expect(messageUpdate?.set).toEqual({ llmMetadata: { clientMessageId: "msg-1", thread: { commentId: "c1" }, noReply: true } });
		expect(inserts).toEqual([]);
		const batchUpdate = updates.find((update) => update.table === agentResponseBatch);
		expect(batchUpdate?.set.status).toBe("no_reply");
	});

	it("schedules idle follow-ups on every interface, and lets live group chats move on every minute or two", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		const worker = new AgentReplyWorker({});
		const schedule = async (task: Record<string, unknown>, followUpCount = 0, afterReply = false) => {
			const { executor, inserts } = makeFollowUpExecutor({
				status: "in_progress",
				followUpCount,
				expiresAt: new Date(now.getTime() + 3_600_000),
				task,
			});
			await (
				worker as unknown as {
					scheduleFollowUp: (executor: unknown, sessionId: number, now: Date, afterReply: boolean) => Promise<void>;
				}
			).scheduleFollowUp(executor, 5, now, afterReply);
			return inserts[0]?.values;
		};
		const due = (values: Record<string, unknown> | undefined) => (values?.dueAt as Date).getTime() - now.getTime();

		const nudge = await schedule({ id: 1, ui: "imessage", urgency: "high", openingState: null });
		expect(nudge).toMatchObject({ sessionId: 5, kind: "follow_up", status: "pending", inputMessageId: null });
		expect(due(nudge)).toBe(URGENCY_PRESETS.high.idleFollowUpDelayMs);
		// One-to-one nudges are limited per session, even after a reply.
		expect(await schedule({ id: 1, ui: "reddit", urgency: "high", openingState: null }, 2, true)).toBeUndefined();

		const channel = { id: 1, ui: "discord", urgency: "high", openingState: { previousMessages: [{ sender: "zote", text: "a" }] } };
		expect(due(await schedule(channel))).toBeGreaterThanOrEqual(60_000);
		expect(due(await schedule(channel, 5))).toBeLessThanOrEqual(120_000);
		expect(await schedule(channel, LIVE_CHAT_TICKS)).toBeUndefined();
		// Each silence after the cast answers the learner gets its own budget.
		expect(await schedule(channel, LIVE_CHAT_TICKS, true)).toMatchObject({ kind: "follow_up" });
	});

	it("lets a live chat move on only while the learner has seen its last messages", () => {
		const tick = { kind: "follow_up", live: true, lastReplyId: 9, lastSeenId: 9 };
		expect(isUnwatchedTick(tick)).toBe(false);
		expect(isUnwatchedTick({ ...tick, lastSeenId: 8 })).toBe(true);
		expect(isUnwatchedTick({ ...tick, lastSeenId: null, lastReplyId: null })).toBe(false);
		// Replies to the learner and one-to-one nudges (meant to bring them back) always run.
		expect(isUnwatchedTick({ ...tick, lastSeenId: 8, kind: "reply" })).toBe(false);
		expect(isUnwatchedTick({ ...tick, lastSeenId: 8, live: false })).toBe(false);
		// A world moment waits the same way: an abandoned thread spends no calls.
		expect(isUnwatchedTick({ ...tick, lastSeenId: 8, kind: "world", live: false })).toBe(true);
		expect(isUnwatchedTick({ ...tick, lastSeenId: 9, kind: "world", live: false })).toBe(false);
	});

	it("locks the session and batch rows before claiming, then finalizes the batch after the last delivery", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		mockDb.query.agentDelivery.findMany.mockResolvedValue([
			{ id: 41, batchId: 31, sequence: 0, content: "Salut !", author: "Mario", replyTo: null, dueAt: now },
		]);
		mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
			id: 31,
			sessionId: 5,
			status: "delivery_pending",
			inputMessageId: 501,
			parsedResult: null,
			allowIdleFollowUp: false,
		});
		const { tx, operations } = makeDeliveryTx({ remainingDelivery: null });
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});

		await (worker as unknown as { deliverDueMessages: (now: Date) => Promise<void> }).deliverDueMessages(now);

		// locks are taken session -> batch -> delivery, the order submitMessage uses
		expect(operations.filter((operation) => operation.kind.startsWith("lock:"))).toEqual([
			{ kind: "lock:update", table: practiceSession },
			{ kind: "lock:update", table: agentResponseBatch },
		]);
		// the delivery is claimed only after the batch row lock is held, so a sibling
		// delivery transaction cannot observe this claim as still pending
		const batchLockIndex = operations.findIndex((operation) => operation.kind === "lock:update" && operation.table === agentResponseBatch);
		const claimIndex = operations.findIndex(
			(operation) => operation.kind === "update" && operation.table === agentDelivery && operation.set?.status === "delivered",
		);
		expect(claimIndex).toBeGreaterThan(batchLockIndex);

		const finalize = operations.find(
			(operation) => operation.kind === "update" && operation.table === agentResponseBatch && operation.set?.status === "completed",
		);
		expect(finalize).toBeDefined();
		const messageInsert = operations.find((operation) => operation.kind === "insert" && operation.table === sessionMessage);
		expect(messageInsert?.set).toMatchObject({ sessionId: 5, role: "assistant", content: "Salut !", deliveryId: 41, responseBatchId: 31 });
	});

	it("leaves the batch delivery_pending while a sibling delivery is still pending", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		mockDb.query.agentDelivery.findMany.mockResolvedValue([
			{ id: 41, batchId: 31, sequence: 0, content: "Salut !", author: "Mario", replyTo: null, dueAt: now },
		]);
		mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
			id: 31,
			sessionId: 5,
			status: "delivery_pending",
			inputMessageId: 501,
			parsedResult: null,
			allowIdleFollowUp: false,
		});
		const { tx, operations } = makeDeliveryTx({ remainingDelivery: { id: 42 } });
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});

		await (worker as unknown as { deliverDueMessages: (now: Date) => Promise<void> }).deliverDueMessages(now);

		const finalize = operations.find(
			(operation) =>
				operation.kind === "update" &&
				operation.table === agentResponseBatch &&
				(operation.set?.status === "completed" || operation.set?.status === "terminated"),
		);
		expect(finalize).toBeUndefined();
	});

	it("finalizes a terminating batch inside the delivery transaction and ends the session", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		mockDb.query.agentDelivery.findMany.mockResolvedValue([
			{ id: 41, batchId: 31, sequence: 0, content: "Je dois couper court.", author: "Mario", replyTo: null, dueAt: now },
		]);
		mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
			id: 31,
			sessionId: 5,
			status: "delivery_pending",
			inputMessageId: 501,
			parsedResult: { decision: "terminate_abuse" },
			allowIdleFollowUp: false,
		});
		const { tx, operations } = makeDeliveryTx({ remainingDelivery: null });
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});

		await (worker as unknown as { deliverDueMessages: (now: Date) => Promise<void> }).deliverDueMessages(now);

		expect(
			operations.find((operation) => operation.kind === "update" && operation.table === agentResponseBatch && operation.set?.status === "terminated"),
		).toBeDefined();
		expect(
			operations.find(
				(operation) => operation.kind === "update" && operation.table === practiceSession && operation.set?.completionReason === "terminated_abuse",
			),
		).toBeDefined();
	});

	it("settles a reply whose deliveries were all filtered out, whatever the decision said", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		const batch = {
			id: 31,
			sessionId: 5,
			claimToken: "token-31",
			status: "processing",
			kind: "reply",
			generationCount: 1,
			inputMessageId: 501,
		} as Parameters<AgentReplyWorker["persistGenerationOutcome"]>[0];
		// The model chose reply, but every delivery was written for someone else.
		const result = {
			requestMessages: [],
			rawResponse: "",
			parsedResult: { decision: "reply", deliveries: [], allowIdleFollowUp: false, terminationReason: null },
			providerMetadata: { finishReason: "stop" },
		} as unknown as AgentGenerationArtifacts;
		const message = { id: 501, sessionId: 5, role: "user", llmMetadata: { attempt: 0 } };
		const { tx, updates, inserts } = makeRecordingTx(31, [], null, {
			messageRow: message,
			siblings: [{ id: 31, status: "no_reply", error: null }],
			userMessages: [message],
			delivered: [],
		});
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});
		await (worker as unknown as { persistGenerationOutcome: (b: unknown, r: unknown, n: Date) => Promise<void> }).persistGenerationOutcome(
			batch,
			result,
			now,
		);

		const batchUpdate = updates.find((update) => update.table === agentResponseBatch);
		expect(batchUpdate?.set.status).toBe("no_reply");
		const messageUpdate = updates.find((update) => update.table === sessionMessage);
		expect(messageUpdate?.set).toEqual({ llmMetadata: { attempt: 0, noReply: true, failed: false, failureError: null } });
		expect(inserts).toEqual([]);
	});

	it("cancels a world batch whose session ended while it was generating, deciding under the session lock", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		const batch = {
			id: 31,
			sessionId: 5,
			claimToken: "token-31",
			status: "processing",
			kind: "world",
			generationCount: 1,
			inputMessageId: null,
		} as Parameters<AgentReplyWorker["persistGenerationOutcome"]>[0];
		const result = {
			requestMessages: [],
			rawResponse: "",
			parsedResult: {
				decision: "reply",
				deliveries: [{ author: "op", replyTo: null, content: "meanwhile" }],
				allowIdleFollowUp: false,
				terminationReason: null,
			},
			providerMetadata: { finishReason: "stop" },
		} as unknown as AgentGenerationArtifacts;

		const ended = makeRecordingTx(31, [], null, { sessionRow: { status: "completed" } });
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(ended.tx));
		const worker = new AgentReplyWorker({});
		await (worker as unknown as { persistGenerationOutcome: (b: unknown, r: unknown, n: Date) => Promise<void> }).persistGenerationOutcome(
			batch,
			result,
			now,
		);
		const cancelUpdate = ended.updates.find((update) => update.table === agentResponseBatch);
		expect(cancelUpdate?.set.status).toBe("cancelled");
		expect(ended.inserts).toEqual([]);

		// while the session is still in progress, the moment is queued as usual
		const open = makeRecordingTx(31, [], null, { sessionRow: { status: "in_progress" } });
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(open.tx));
		await (worker as unknown as { persistGenerationOutcome: (b: unknown, r: unknown, n: Date) => Promise<void> }).persistGenerationOutcome(
			batch,
			result,
			now,
		);
		expect(open.updates.find((update) => update.table === agentResponseBatch)?.set.status).toBe("delivery_pending");
		expect(open.inserts).toHaveLength(1);
	});

	it("cancels an ended world batch that decided to terminate abuse, without touching spared replies", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		const batch = {
			id: 31,
			sessionId: 5,
			claimToken: "token-31",
			status: "processing",
			kind: "world",
			generationCount: 1,
			inputMessageId: null,
		} as Parameters<AgentReplyWorker["persistGenerationOutcome"]>[0];
		const result = {
			requestMessages: [{ role: "system", content: "evidence" }],
			rawResponse: "raw",
			parsedResult: {
				decision: "terminate_abuse",
				deliveries: [{ author: "op", replyTo: null, content: "parting words" }],
				allowIdleFollowUp: false,
				terminationReason: "Severe abuse",
			},
			providerMetadata: { finishReason: "stop" },
		} as unknown as AgentGenerationArtifacts;

		const { tx, updates, inserts } = makeRecordingTx(31, [29, 30], null, { sessionRow: { status: "completed" } });
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});
		await (worker as unknown as { persistGenerationOutcome: (b: unknown, r: unknown, n: Date) => Promise<void> }).persistGenerationOutcome(
			batch,
			result,
			now,
		);

		// the world batch itself is cancelled with its generation evidence persisted...
		const cancelUpdate = updates.find((update) => update.table === agentResponseBatch && update.set.status === "cancelled");
		expect(cancelUpdate?.set).toMatchObject({ status: "cancelled", requestMessages: [{ role: "system", content: "evidence" }], rawResponse: "raw" });
		// ...and the abuse side effects never run: spared sibling replies and their deliveries
		// survive, the session is not re-ended, and nothing is queued for delivery
		expect(updates.filter((update) => update.table === practiceSession)).toEqual([]);
		expect(bareStrings(cancelUpdate?.clause)).not.toEqual(expect.arrayContaining([29, 30]));
		expect(inserts).toEqual([]);
	});

	it("hands the generation count back when an unread world moment is rescheduled", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		const worker = new AgentReplyWorker({});
		const updates: RecordedUpdate[] = [];
		const executor = {
			update: (table: unknown) => ({
				set: (values: Record<string, unknown>) => ({
					where: () => {
						updates.push({ table, set: values, clause: null });
						return Object.assign(Promise.resolve(undefined), { returning: async () => [{ id: 1 }] });
					},
				}),
			}),
		};
		const batch = { id: 9, sessionId: 5, claimToken: "t", generationCount: 2 } as Parameters<AgentReplyWorker["persistGenerationOutcome"]>[0];
		const session = { expiresAt: new Date(now.getTime() + 3_600_000), task: { urgency: "high" } };
		await (worker as unknown as { skipUnwatchedWorld: (e: unknown, b: unknown, s: unknown, n: Date) => Promise<void> }).skipUnwatchedWorld(
			executor,
			batch,
			session,
			now,
		);
		expect(updates[0]?.set).toMatchObject({ status: "pending", generationCount: 1 });
		// a real failure after several unread reschedules still has its retries
		expect(shouldRetryGeneration(1)).toBe(true);

		updates.length = 0;
		const expiring = { expiresAt: new Date(now.getTime() + 4 * 60_000), task: { urgency: "high" } };
		await (worker as unknown as { skipUnwatchedWorld: (e: unknown, b: unknown, s: unknown, n: Date) => Promise<void> }).skipUnwatchedWorld(
			executor,
			batch,
			expiring,
			now,
		);
		expect(updates[0]?.set).toMatchObject({ status: "cancelled" });
	});

	it("counts an overlap world moment that shares the learner message's timestamp in the window budget", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		const { executor, wheres } = makeWorldExecutor({ spent: WORLD_WINDOW_LIMIT - 1 });
		await expect(scheduleWorldMoment(executor as never, { sessionId: 5, now })).resolves.toBe(true);
		// the budget query compares with >= so a moment created in the same transaction as the
		// learner message (same now()) counts against the window it opened
		const operatorText: string[] = [];
		const walk = (value: unknown): void => {
			if (!value || typeof value !== "object") return;
			if (Array.isArray(value)) {
				value.forEach(walk);
				return;
			}
			if ("columnType" in (value as object)) return;
			if ("queryChunks" in value) {
				walk((value as { queryChunks: unknown[] }).queryChunks);
				return;
			}
			const inner = (value as { value?: unknown }).value;
			if (Array.isArray(inner)) {
				for (const part of inner) if (typeof part === "string") operatorText.push(part);
			}
		};
		walk(wheres[0]);
		expect(operatorText.join("")).toContain(">=");
	});

	it("creates the preserved mail follow-on when the first email actually lands", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		mockDb.query.agentDelivery.findMany.mockResolvedValue([
			{ id: 41, batchId: 31, sequence: 0, content: "First answer", author: "Maya", replyTo: null, dueAt: now },
		]);
		mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
			id: 31,
			sessionId: 5,
			status: "delivery_pending",
			kind: "reply",
			inputMessageId: 501,
			participant: "Maya",
			attempt: 0,
			targetRef: null,
			inputVersion: 1,
			parsedResult: { decision: "reply", preservedFollowOn: { author: "Maya", replyTo: null, content: "A later thought" } },
			allowIdleFollowUp: false,
			session: { task: { id: 1, ui: "apple_mail", urgency: "high", openingState: { emails: [] } } },
		});
		const { tx, operations } = makeDeliveryTx({ deliveredCount: 1, remainingDelivery: null });
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});

		await (worker as unknown as { deliverDueMessages: (now: Date) => Promise<void> }).deliverDueMessages(now);

		const followOnBatch = operations.find((operation) => operation.kind === "insert" && operation.table === agentResponseBatch);
		expect(followOnBatch?.set).toMatchObject({
			sessionId: 5,
			kind: "reply",
			status: "delivery_pending",
			participant: "Maya",
			inputMessageId: 501,
		});
		const followOnDelivery = operations
			.filter((operation) => operation.kind === "insert" && operation.table === agentDelivery)
			.find((operation) => operation.set?.content === "A later thought");
		expect(followOnDelivery?.set).toMatchObject({ sequence: 0, author: "Maya", replyTo: null });
		// the clock starts at the delivery, never before the email it follows
		expect((followOnBatch?.set?.dueAt as Date).getTime()).toBeGreaterThan(now.getTime());
	});

	it("drops a threaded delivery whose reply target went missing, recording the anomaly", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		mockDb.query.agentDelivery.findMany.mockResolvedValue([
			{ id: 41, batchId: 31, sequence: 0, content: "continuing", author: "alex", replyTo: "reddit-user-m9", dueAt: now },
		]);
		mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
			id: 31,
			sessionId: 5,
			status: "delivery_pending",
			kind: "reply",
			inputMessageId: 501,
			parsedResult: null,
			allowIdleFollowUp: false,
			providerMetadata: {},
			session: { task: { id: 1, ui: "reddit", urgency: "high", openingState: { post: { author: "op" } } } },
		});
		const message = { id: 501, sessionId: 5, role: "user", llmMetadata: { attempt: 0 } };
		const { tx, operations } = makeDeliveryTx({
			remainingDelivery: null,
			settleMessage: message,
			userMessages: [message],
			siblings: [{ id: 31, status: "completed", error: null }],
			deliveredCount: 0,
		});
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});

		await (worker as unknown as { deliverDueMessages: (now: Date) => Promise<void> }).deliverDueMessages(now);

		// no session message is inserted for a reply that lost its prerequisite
		expect(operations.some((operation) => operation.kind === "insert" && operation.table === sessionMessage)).toBe(false);
		// ... and the message settles as if nothing landed, instead of waiting forever
		const settled = operations.find((operation) => operation.kind === "update" && operation.table === sessionMessage);
		expect(settled?.set).toEqual({ llmMetadata: { attempt: 0, noReply: true, failed: false, failureError: null } });
		const warning = operations.find(
			(operation) => operation.kind === "update" && operation.table === agentResponseBatch && operation.set?.providerMetadata,
		);
		expect((warning?.set?.providerMetadata as { contractWarnings?: string[] }).contractWarnings?.[0]).toContain("missing its target");
		// the batch still finalizes once nothing is left pending
		expect(
			operations.some((operation) => operation.kind === "update" && operation.table === agentResponseBatch && operation.set?.status === "completed"),
		).toBe(true);
	});

	it("carries the world activity on after a landed world moment, within the budget", async () => {
		vi.spyOn(globalThis.Math, "random").mockReturnValue(0.1);
		const now = new Date("2026-08-21T12:00:00.000Z");
		mockDb.query.agentDelivery.findMany.mockResolvedValue([
			{ id: 41, batchId: 31, sequence: 0, content: "meanwhile", author: "op", replyTo: null, dueAt: now },
		]);
		mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
			id: 31,
			sessionId: 5,
			status: "delivery_pending",
			kind: "world",
			inputMessageId: null,
			parsedResult: null,
			allowIdleFollowUp: null,
			session: { task: { id: 1, ui: "reddit", urgency: "high", openingState: { post: { author: "op" } } } },
		});
		const worldSession = {
			id: 5,
			userId: "user-1",
			status: "in_progress",
			expiresAt: new Date(now.getTime() + 3_600_000),
			task: { id: 1, ui: "reddit", language: "en", openingState: { post: { author: "op" } }, urgency: "high" },
			messages: [{ id: 501, role: "user", content: "anyone?", createdAt: now }],
		};
		const { tx, operations } = makeDeliveryTx({ remainingDelivery: null, worldSession });
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});

		await (worker as unknown as { deliverDueMessages: (now: Date) => Promise<void> }).deliverDueMessages(now);

		const worldInsert = operations.find((operation) => operation.kind === "insert" && operation.table === agentResponseBatch);
		expect(worldInsert?.set).toMatchObject({ sessionId: 5, kind: "world", status: "pending", inputMessageId: null });
		expect(typeof worldInsert?.set?.participant).toBe("string");
		vi.restoreAllMocks();
	});

	it("cancels the delivery instead of delivering into a user-ended session", async () => {
		const now = new Date("2026-08-21T12:00:00.000Z");
		mockDb.query.agentDelivery.findMany.mockResolvedValue([
			{ id: 41, batchId: 31, sequence: 0, content: "Salut !", author: "Mario", replyTo: null, dueAt: now },
		]);
		mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({
			id: 31,
			sessionId: 5,
			status: "delivery_pending",
			inputMessageId: 501,
			parsedResult: null,
			allowIdleFollowUp: false,
		});
		const { tx, operations } = makeDeliveryTx({
			sessionRow: { status: "completed", completionReason: "user_requested" },
		});
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});

		await (worker as unknown as { deliverDueMessages: (now: Date) => Promise<void> }).deliverDueMessages(now);

		expect(
			operations.find((operation) => operation.kind === "update" && operation.table === agentDelivery && operation.set?.status === "cancelled"),
		).toBeDefined();
		expect(operations.some((operation) => operation.kind === "insert" && operation.table === sessionMessage)).toBe(false);
	});

	it("enforces configured concurrency across scheduler ticks and waits for active work on stop", async () => {
		vi.useFakeTimers();
		const worker = new AgentReplyWorker({ scanIntervalMs: 10, concurrency: 2 });
		const internals = worker as unknown as {
			expireSessions: ReturnType<typeof vi.fn>;
			reclaimExpiredLeases: ReturnType<typeof vi.fn>;
			deliverDueMessages: ReturnType<typeof vi.fn>;
			claimDueBatch: ReturnType<typeof vi.fn>;
			processBatch: ReturnType<typeof vi.fn>;
		};
		internals.expireSessions = vi.fn().mockResolvedValue(undefined);
		internals.reclaimExpiredLeases = vi.fn().mockResolvedValue(undefined);
		internals.deliverDueMessages = vi.fn().mockResolvedValue(undefined);
		const batches = [{ id: 1 }, { id: 2 }, { id: 3 }];
		internals.claimDueBatch = vi.fn().mockImplementation(async () => batches.shift() ?? null);
		const releases: Array<() => void> = [];
		internals.processBatch = vi.fn().mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					releases.push(resolve);
				}),
		);

		worker.start();
		await vi.advanceTimersByTimeAsync(50);
		expect(internals.processBatch).toHaveBeenCalledTimes(2);
		expect(internals.claimDueBatch).toHaveBeenCalledTimes(2);

		let stopped = false;
		const stopping = worker.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		for (const release of releases) release();
		await stopping;
		expect(stopped).toBe(true);
	});
});

/** Transaction double for settlement: replays the input message, sibling batches and
 * delivered-delivery counts, recording every metadata write. */
function makeSettleTx(options: {
	message?: Record<string, unknown> | null;
	siblings?: Array<{ id: number; status: string; error?: string | null }>;
	delivered?: Array<{ batchId: number; count: number }>;
	userMessages?: Array<Record<string, unknown>>;
}) {
	const updates: RecordedUpdate[] = [];
	const tx = {
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: (clause: unknown) => {
					updates.push({ table, set: values, clause });
					return Object.assign(Promise.resolve(undefined), { returning: async () => [{ id: 1 }] });
				},
			}),
		}),
		select: () => ({
			from: () => ({
				where: () =>
					Object.assign(Promise.resolve(options.delivered ?? []), {
						groupBy: () => Promise.resolve(options.delivered ?? []),
					}),
			}),
		}),
		query: {
			sessionMessage: {
				findFirst: vi.fn().mockResolvedValue(options.message ?? null),
				findMany: vi.fn().mockResolvedValue(options.userMessages ?? []),
			},
			agentResponseBatch: { findMany: vi.fn().mockResolvedValue(options.siblings ?? []) },
		},
	};
	return { tx, updates };
}

describe("aggregated message flags", () => {
	const message = (metadata: Record<string, unknown> = {}) => ({ id: 501, sessionId: 5, role: "user", llmMetadata: { attempt: 0, ...metadata } });
	const metadataWrites = (updates: RecordedUpdate[]) =>
		updates.filter((update) => update.table === sessionMessage).map((update) => update.set.llmMetadata as Record<string, unknown>);

	it("leaves the message answered or awaiting while any sibling has delivered or is still working", async () => {
		const head = message({ noReply: true, failed: true, failureError: "boom" });
		const { tx, updates } = makeSettleTx({
			message: head,
			siblings: [
				{ id: 11, status: "no_reply" },
				{ id: 12, status: "delivery_pending" },
			],
			delivered: [{ batchId: 13, count: 1 }],
			userMessages: [head],
		});
		await settleUserMessageFlags(tx as never, 501);
		// a delivering sibling clears the silence flag but leaves an earlier failure alone
		expect(metadataWrites(updates)).toEqual([{ attempt: 0, failed: true, failureError: "boom", noReply: false }]);
	});

	it("sets noReply on the head and every folded message when all siblings ended silent", async () => {
		const head = message();
		const { tx, updates } = makeSettleTx({
			message: head,
			siblings: [
				{ id: 11, status: "no_reply" },
				{ id: 12, status: "completed" },
			],
			userMessages: [head, { id: 502, role: "user", llmMetadata: { foldedInto: 501 } }],
		});
		await settleUserMessageFlags(tx as never, 501);
		expect(metadataWrites(updates)).toHaveLength(2);
		for (const write of metadataWrites(updates)) expect(write).toMatchObject({ noReply: true, failed: false });
	});

	it("sets failed, with the retry affordance, when a sibling ended failed among otherwise silent ones", async () => {
		const head = message();
		const { tx, updates } = makeSettleTx({
			message: head,
			siblings: [
				{ id: 11, status: "failed", error: "provider exploded" },
				{ id: 12, status: "no_reply" },
			],
			userMessages: [head],
		});
		await settleUserMessageFlags(tx as never, 501);
		expect(metadataWrites(updates)).toEqual([{ attempt: 0, noReply: false, failed: true, failureError: "provider exploded" }]);
	});

	it("settles nothing when every sibling was cancelled by session-level guards", async () => {
		const { tx, updates } = makeSettleTx({
			message: message(),
			siblings: [{ id: 11, status: "cancelled" }],
		});
		await settleUserMessageFlags(tx as never, 501);
		expect(updates).toEqual([]);
	});

	it("scopes siblings by the message's current attempt, not its history", async () => {
		const head = message({ attempt: 2 });
		const { tx, updates } = makeSettleTx({
			message: head,
			siblings: [{ id: 13, status: "no_reply" }],
			userMessages: [head],
		});
		await settleUserMessageFlags(tx as never, 501);
		// the sibling query carries the attempt counter and the reply kind
		const where = (tx.query.agentResponseBatch.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
		expect(bareStrings(where)).toEqual(expect.arrayContaining([2, "reply"]));
		expect(metadataWrites(updates)).toEqual([{ attempt: 2, noReply: true, failed: false, failureError: null }]);
	});
});

function makeWorldExecutor(options: { session?: Record<string, unknown> | null; outstanding?: Record<string, unknown> | null; spent?: number } = {}) {
	const worldSession = (overrides: Record<string, unknown> = {}) => ({
		id: 5,
		userId: "user-1",
		status: "in_progress",
		expiresAt: new Date("2026-08-21T13:00:00.000Z"),
		task: { id: 1, ui: "reddit", language: "en", openingState: { post: { author: "op" } }, urgency: "high" },
		messages: [{ id: 501, role: "user", content: "anyone?", createdAt: new Date("2026-08-21T12:00:00.000Z") }],
		...overrides,
	});
	const inserts: RecordedInsert[] = [];
	const wheres: unknown[] = [];
	const executor = {
		query: {
			practiceSession: { findFirst: vi.fn().mockResolvedValue(options.session ?? worldSession()) },
			user: { findFirst: vi.fn().mockResolvedValue({ name: "Maple" }) },
			agentResponseBatch: { findFirst: vi.fn().mockResolvedValue(options.outstanding ?? null) },
		},
		select: () => ({
			from: () => ({
				where: (clause: unknown) => {
					wheres.push(clause);
					return Promise.resolve([{ count: options.spent ?? 0 }]);
				},
			}),
		}),
		insert: (table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				inserts.push({ table, values });
				return [{ id: 99 }];
			},
		}),
	};
	return { executor, inserts, wheres, worldSession };
}

describe("world moment scheduling", () => {
	const now = new Date("2026-08-21T12:00:00.000Z");

	it("creates a pending world moment with a drawn participant on the idle cadence", async () => {
		const { executor, inserts } = makeWorldExecutor();
		await expect(scheduleWorldMoment(executor as never, { sessionId: 5, now })).resolves.toBe(true);
		expect(inserts).toHaveLength(1);
		expect(inserts[0].values).toMatchObject({ sessionId: 5, kind: "world", status: "pending", inputMessageId: null });
		expect(typeof inserts[0].values.participant).toBe("string");
		expect((inserts[0].values.dueAt as Date).getTime()).toBeGreaterThan(now.getTime());
	});

	it("schedules only for async group scenes that are still in progress", async () => {
		const imessage = makeWorldExecutor({
			session: { task: { id: 1, ui: "imessage", language: "en", openingState: {}, urgency: "high" } },
		});
		await expect(scheduleWorldMoment(imessage.executor as never, { sessionId: 5, now })).resolves.toBe(false);
		const ended = makeWorldExecutor({ session: { status: "completed" } });
		await expect(scheduleWorldMoment(ended.executor as never, { sessionId: 5, now })).resolves.toBe(false);
		expect(imessage.inserts).toEqual([]);
	});

	it("respects the probability, the outstanding guard, the window budget, and session expiry", async () => {
		const never = makeWorldExecutor();
		await expect(scheduleWorldMoment(never.executor as never, { sessionId: 5, now, probability: 0 })).resolves.toBe(false);
		const outstanding = makeWorldExecutor({ outstanding: { id: 8 } });
		await expect(scheduleWorldMoment(outstanding.executor as never, { sessionId: 5, now })).resolves.toBe(false);
		const spent = makeWorldExecutor({ spent: WORLD_WINDOW_LIMIT });
		await expect(scheduleWorldMoment(spent.executor as never, { sessionId: 5, now })).resolves.toBe(false);
		const expiring = makeWorldExecutor({ session: { expiresAt: new Date(now.getTime() + 4 * 60_000) } });
		await expect(scheduleWorldMoment(expiring.executor as never, { sessionId: 5, now })).resolves.toBe(false);
		expect([...never.inserts, ...outstanding.inserts, ...spent.inserts, ...expiring.inserts]).toEqual([]);
	});

	it("treats a unique-index violation from the hard guard as a no-op, not an error", async () => {
		const { executor } = makeWorldExecutor();
		(executor.insert as unknown as (table: unknown) => { values: () => Promise<never> }) = () => ({
			values: () => Promise.reject(Object.assign(new Error("dup"), { code: "23505" })),
		});
		await expect(scheduleWorldMoment(executor as never, { sessionId: 5, now })).resolves.toBe(false);
	});
});
