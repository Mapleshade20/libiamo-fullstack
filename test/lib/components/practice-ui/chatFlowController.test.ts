import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MessageSubmissionResult, submitPracticeMessage } from "$lib/components/practice-ui/chatFlowController";

global.fetch = vi.fn();
vi.mock("$app/forms", () => ({
	deserialize: vi.fn((text: string) => JSON.parse(text)),
}));

async function mockPending() {
	(global.fetch as any).mockResolvedValue({
		text: () => Promise.resolve(JSON.stringify({ type: "success", data: { pending: true } })),
	});
}

function mockFailure(status: number) {
	(global.fetch as any).mockResolvedValue({
		text: () => Promise.resolve(JSON.stringify({ type: "failure", status, data: { error: "err" } })),
	});
}

describe("submitPracticeMessage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns pending status when server indicates pending", async () => {
		await mockPending();

		const result = await submitPracticeMessage(1, "Hi", "client-1");

		expect(result).toEqual({ status: "pending" } satisfies MessageSubmissionResult);
	});

	it("rejects an unexpected success payload without a queued or completed state", async () => {
		(global.fetch as any).mockResolvedValue({
			text: () => Promise.resolve(JSON.stringify({ type: "success", data: { reply: "legacy synchronous response" } })),
		});

		const result = await submitPracticeMessage(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed" } satisfies MessageSubmissionResult);
	});

	it("returns an already-completed session result without requesting completion again", async () => {
		(global.fetch as any).mockResolvedValue({
			text: () =>
				Promise.resolve(JSON.stringify({ type: "success", data: { sessionCompleted: true, completionReason: "max_turns", pending: false } })),
		});

		const result = await submitPracticeMessage(1, "Final turn", "client-final");

		expect(result).toEqual({ status: "session_completed", completionReason: "max_turns" } satisfies MessageSubmissionResult);
	});

	it("returns server error message on 4xx client error", async () => {
		mockFailure(400);

		const result = await submitPracticeMessage(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed", error: "err" } satisfies MessageSubmissionResult);
	});

	it.each([401, 499])("returns server error message for client error status %s", async (status) => {
		mockFailure(status);
		const result = await submitPracticeMessage(1, "Hi", "client-1");
		expect(result).toEqual({ status: "failed", error: "err" } satisfies MessageSubmissionResult);
	});

	it("returns failed on network error", async () => {
		(global.fetch as any).mockRejectedValue(new Error("Network down"));

		const result = await submitPracticeMessage(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed" } satisfies MessageSubmissionResult);
		expect(console.error).toHaveBeenCalledWith("Message submission failed:", expect.any(Error));
	});

	it("returns failed on abort/timeout", async () => {
		const abortError = new DOMException("Aborted", "AbortError");
		(global.fetch as any).mockRejectedValue(abortError);

		const result = await submitPracticeMessage(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed" } satisfies MessageSubmissionResult);
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining("timed out"));
	});

	it("returns failed when result is null", async () => {
		(global.fetch as any).mockResolvedValue({
			text: () => Promise.resolve(JSON.stringify(null)),
		});

		const result = await submitPracticeMessage(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed" } satisfies MessageSubmissionResult);
	});

	it("returns failed when success has no data", async () => {
		(global.fetch as any).mockResolvedValue({
			text: () => Promise.resolve(JSON.stringify({ type: "success" })),
		});

		const result = await submitPracticeMessage(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed" } satisfies MessageSubmissionResult);
	});

	it("sends correct FormData to the send endpoint", async () => {
		await mockPending();

		await submitPracticeMessage(42, "Hello Agent", "msg-abc");

		const fetchCall = (global.fetch as any).mock.calls[0];
		expect(fetchCall[0]).toBe("?/send");
		expect(fetchCall[1].method).toBe("POST");
		expect(fetchCall[1].body.get("sessionId")).toBe("42");
		expect(fetchCall[1].body.get("message")).toBe("Hello Agent");
		expect(fetchCall[1].body.get("clientMessageId")).toBe("msg-abc");
	});

	it.each([0, 500, 503])("returns failed for non-client failure status %s", async (status) => {
		mockFailure(status);
		const result = await submitPracticeMessage(1, "Hi", "client-1");
		expect(result).toEqual({ status: "failed", error: "err" } satisfies MessageSubmissionResult);
	});

	it("appends extra fields to FormData", async () => {
		await mockPending();

		await submitPracticeMessage(42, "Hello", "msg-1", { threadTargetCommentId: "reddit-c1" });

		const fetchCall = (global.fetch as any).mock.calls[0];
		expect(fetchCall[1].body.get("threadTargetCommentId")).toBe("reddit-c1");
	});
});
