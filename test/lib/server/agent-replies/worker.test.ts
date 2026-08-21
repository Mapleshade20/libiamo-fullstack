import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
	mockDb: { transaction: vi.fn() },
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));

import type { AgentGenerationArtifacts } from "$lib/server/agent-replies/generator";
import {
	AgentReplyWorker,
	buildDeliveredReplyMetadata,
	getBatchGenerationInstruction,
	getDeliveryDueAt,
	getThreadMetadataFromMessage,
	getUrgencyFollowUpAt,
	hasEndedByMaxTurns,
	isStaleGeneration,
	MAX_GENERATION_ATTEMPTS,
	shouldDeliverIntoEndedSession,
	shouldRetryGeneration,
} from "$lib/server/agent-replies/worker";
import { agentDelivery, agentResponseBatch, practiceSession } from "$lib/server/db/schema";

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

function makeRecordingTx(batchId: number, siblingBatchIds: number[]) {
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
		select: () => ({ from: () => ({ where: async () => siblingBatchIds.map((id) => ({ id })) }) }),
		insert: (table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				inserts.push({ table, values });
			},
		}),
	};
	return { tx, updates, inserts };
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

	it("injects an idle nudge instruction only into follow_up generations", () => {
		expect(getBatchGenerationInstruction("reply", 1)).toBeUndefined();
		const first = getBatchGenerationInstruction("follow_up", 1);
		expect(first).toContain("gone quiet");
		expect(first).toContain("no_reply");
		expect(first).not.toContain("final follow-up");
		const last = getBatchGenerationInstruction("follow_up", 2);
		expect(last).toContain("final follow-up");
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
		expect(shouldDeliverIntoEndedSession({ status: "completed", completionReason: "terminated_abuse" }, "pending")).toBe(false);
	});

	it("carries comment-thread metadata from the answered message onto delivered replies", () => {
		const thread = getThreadMetadataFromMessage({
			clientMessageId: "msg-1",
			thread: { commentId: "ao3-user-msg-1", responderName: "HikariKitsune02", mode: "work" },
		});
		expect(thread).toEqual({ commentId: "ao3-user-msg-1", responderName: "HikariKitsune02" });
		// linear surfaces (iMessage/Discord/Mail) store no thread metadata
		expect(getThreadMetadataFromMessage({ clientMessageId: "msg-2" })).toBeNull();
		expect(getThreadMetadataFromMessage(null)).toBeNull();
		expect(getThreadMetadataFromMessage({ thread: { mode: "work" } })).toBeNull();

		const metadata = buildDeliveredReplyMetadata(thread, 101);
		expect(metadata.assistantAuthorName).toBe("HikariKitsune02");
		expect(metadata.thread).toEqual({ parentCommentId: "ao3-user-msg-1", responderName: "HikariKitsune02", mode: "reply" });
		expect(metadata.replyToMessageId).toBe(101);
		expect(metadata.asyncDelivery).toBe(true);

		// without thread metadata the payload keeps the legacy linear shape
		expect(buildDeliveredReplyMetadata(null, null)).toEqual({ replyToMessageId: null, asyncDelivery: true });
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
				deliveries: [{ content: "Je dois couper court à cette conversation.", replyToMessageId: null }],
				allowIdleFollowUp: false,
				terminationReason: "Severe abuse",
			},
			providerMetadata: { finishReason: "stop" },
		} as unknown as AgentGenerationArtifacts;

		const { tx, updates, inserts } = makeRecordingTx(31, [29, 30]);
		mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
		const worker = new AgentReplyWorker({});
		await (
			worker as unknown as { persistGenerationOutcome: (b: unknown, s: unknown, r: unknown, n: Date) => Promise<void> }
		).persistGenerationOutcome(batch, { urgency: "high" }, result, now);

		// the terminating batch itself is queued for delivery, never cancelled
		const fenceUpdate = updates.find((update) => update.table === agentResponseBatch && update.set.status === "delivery_pending");
		expect(fenceUpdate).toBeDefined();
		expect(inserts).toEqual([
			{
				table: agentDelivery,
				values: { batchId: 31, sequence: 0, content: "Je dois couper court à cette conversation.", replyToMessageId: null, dueAt: now },
			},
		]);

		// the session ends at decision time, not when the final reply lands
		const sessionUpdate = updates.find((update) => update.table === practiceSession);
		expect(sessionUpdate?.set).toMatchObject({ status: "completed", completionReason: "terminated_abuse" });

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
