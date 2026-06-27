import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attemptAgentReply, type SendAttemptResult } from "$lib/components/practice-ui/chatFlowController";

global.fetch = vi.fn();
vi.mock("$app/forms", () => ({
	deserialize: vi.fn((text: string) => JSON.parse(text)),
}));

async function mockReply(reply: string, terminated = true) {
	(global.fetch as any).mockResolvedValue({
		text: () => Promise.resolve(JSON.stringify({ type: "success", data: { reply, terminated } })),
	});
}

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

describe("attemptAgentReply", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns reply status on successful non-pending response", async () => {
		await mockReply("Hello learner!", true);

		const result = await attemptAgentReply(1, "Hi", "client-1");

		expect(result).toEqual({ status: "reply", text: "Hello learner!", terminated: true } satisfies SendAttemptResult);
	});

	it("returns reply with terminated: false when not terminal", async () => {
		await mockReply("Keep going", false);

		const result = await attemptAgentReply(1, "Hi", "client-1");

		expect(result).toEqual({ status: "reply", text: "Keep going", terminated: false } satisfies SendAttemptResult);
	});

	it("returns pending status when server indicates pending", async () => {
		await mockPending();

		const result = await attemptAgentReply(1, "Hi", "client-1");

		expect(result).toEqual({ status: "pending" } satisfies SendAttemptResult);
	});

	it("returns server error message on 4xx client error", async () => {
		mockFailure(400);

		const result = await attemptAgentReply(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed", error: "err" } satisfies SendAttemptResult);
	});

	it.each([401, 499])("returns server error message for client error status %s", async (status) => {
		mockFailure(status);
		const result = await attemptAgentReply(1, "Hi", "client-1");
		expect(result).toEqual({ status: "failed", error: "err" } satisfies SendAttemptResult);
	});

	it("returns failed on network error", async () => {
		(global.fetch as any).mockRejectedValue(new Error("Network down"));

		const result = await attemptAgentReply(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed" } satisfies SendAttemptResult);
		expect(console.error).toHaveBeenCalledWith("Message submission failed:", expect.any(Error));
	});

	it("returns failed on abort/timeout", async () => {
		const abortError = new DOMException("Aborted", "AbortError");
		(global.fetch as any).mockRejectedValue(abortError);

		const result = await attemptAgentReply(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed" } satisfies SendAttemptResult);
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining("timed out"));
	});

	it("returns failed when result is null", async () => {
		(global.fetch as any).mockResolvedValue({
			text: () => Promise.resolve(JSON.stringify(null)),
		});

		const result = await attemptAgentReply(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed" } satisfies SendAttemptResult);
	});

	it("returns failed when success has no data", async () => {
		(global.fetch as any).mockResolvedValue({
			text: () => Promise.resolve(JSON.stringify({ type: "success" })),
		});

		const result = await attemptAgentReply(1, "Hi", "client-1");

		expect(result).toEqual({ status: "failed" } satisfies SendAttemptResult);
	});

	it("sends correct FormData to the send endpoint", async () => {
		await mockReply("OK", false);

		await attemptAgentReply(42, "Hello Agent", "msg-abc");

		const fetchCall = (global.fetch as any).mock.calls[0];
		expect(fetchCall[0]).toBe("?/send");
		expect(fetchCall[1].method).toBe("POST");
		expect(fetchCall[1].body.get("sessionId")).toBe("42");
		expect(fetchCall[1].body.get("message")).toBe("Hello Agent");
		expect(fetchCall[1].body.get("clientMessageId")).toBe("msg-abc");
	});

	it.each([0, 500, 503])("returns failed for non-client failure status %s", async (status) => {
		mockFailure(status);
		const result = await attemptAgentReply(1, "Hi", "client-1");
		expect(result).toEqual({ status: "failed", error: "err" } satisfies SendAttemptResult);
	});

	it("appends extra fields to FormData", async () => {
		await mockReply("OK", false);

		await attemptAgentReply(42, "Hello", "msg-1", { threadTargetCommentId: "reddit-c1" });

		const fetchCall = (global.fetch as any).mock.calls[0];
		expect(fetchCall[1].body.get("threadTargetCommentId")).toBe("reddit-c1");
	});
});
