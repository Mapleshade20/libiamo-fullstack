import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AsyncReplyWorker,
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
} from "$lib/server/async-replies/worker";

afterEach(() => vi.useRealTimers());

describe("async reply worker scheduling", () => {
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

	it("enforces configured concurrency across scheduler ticks and waits for active work on stop", async () => {
		vi.useFakeTimers();
		const worker = new AsyncReplyWorker({ scanIntervalMs: 10, concurrency: 2 });
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
