import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	submitAgentReply: vi.fn(),
	waitForRetry: vi.fn(),
	clearRetry: vi.fn(),
}));

vi.mock("$lib/components/practice-ui/apiService", () => ({
	submitAgentReply: mocks.submitAgentReply,
}));

vi.mock("$lib/components/practice-ui/retryManager", () => ({
	retryManager: {
		waitForRetry: mocks.waitForRetry,
		clear: mocks.clearRetry,
	},
}));

import type { FlowCallbacks } from "$lib/components/practice-ui/chatFlowController";
import { runAgentReplyWorkflow } from "$lib/components/practice-ui/chatFlowController";

describe("chatFlowController", () => {
	const labels = {
		stillProcessing: "Still processing...",
		retryFailed: "Retry failed",
	};

	let callbacks: FlowCallbacks;
	let mockFormatTime: any;
	let mockOnStart: any;
	let mockOnUpdateMessage: any;
	let mockOnCreateAgentMessage: any;
	let mockOnScrollToBottom: any;
	let mockOnComplete: any;
	let mockOnInvalidate: any;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});

		mockFormatTime = vi.fn((date: Date) => date.toISOString());
		mockOnStart = vi.fn();
		mockOnUpdateMessage = vi.fn();
		mockOnCreateAgentMessage = vi.fn();
		mockOnScrollToBottom = vi.fn().mockResolvedValue(undefined);
		mockOnComplete = vi.fn().mockResolvedValue(undefined);
		mockOnInvalidate = vi.fn().mockResolvedValue(undefined);

		callbacks = {
			formatTime: mockFormatTime,
			onStart: mockOnStart,
			onUpdateMessage: mockOnUpdateMessage,
			onCreateAgentMessage: mockOnCreateAgentMessage,
			onScrollToBottom: mockOnScrollToBottom,
			onComplete: mockOnComplete,
			onInvalidate: mockOnInvalidate,
			labels,
		};

		// Default fallback: 4xx to break any unintended infinite loops
		mocks.submitAgentReply.mockResolvedValue({ type: "failure", status: 400, data: { error: "default fallback" } });
		mocks.waitForRetry.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("runAgentReplyWorkflow", () => {
		describe("success path", () => {
			it("creates a sent message on first-try success with termination", async () => {
				mocks.submitAgentReply.mockResolvedValue({
					type: "success",
					data: { reply: "Hello learner!", terminated: true },
				});

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				expect(mockOnStart).not.toHaveBeenCalled();
				expect(mockOnCreateAgentMessage).toHaveBeenCalledOnce();
				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith(
					expect.objectContaining({
						text: "Hello learner!",
						state: "sent",
						timestamp: expect.any(String),
					}),
				);
				expect(mockOnUpdateMessage).not.toHaveBeenCalled();
				expect(mockOnScrollToBottom).toHaveBeenCalledOnce();
				expect(mockOnInvalidate).toHaveBeenCalledOnce();
				expect(mockOnComplete).toHaveBeenCalledOnce();
				expect(mocks.clearRetry).not.toHaveBeenCalled();
			});

			it("does not call onComplete when the reply is not terminal", async () => {
				mocks.submitAgentReply.mockResolvedValue({
					type: "success",
					data: { reply: "Keep going!", terminated: false },
				});

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "Keep going!", state: "sent" }));
				expect(mockOnComplete).not.toHaveBeenCalled();
				expect(mockOnInvalidate).toHaveBeenCalledOnce();
			});

			it("updates existing message on success and calls onStart", async () => {
				mocks.submitAgentReply.mockResolvedValue({
					type: "success",
					data: { reply: "Response!", terminated: true },
				});

				await runAgentReplyWorkflow(1, "client-1", "Hello", "existing-id", callbacks);

				expect(mockOnStart).toHaveBeenCalledOnce();
				expect(mockOnCreateAgentMessage).not.toHaveBeenCalled();
				expect(mockOnUpdateMessage).toHaveBeenCalledWith("existing-id", {
					text: "Response!",
					deliveryState: "sent",
					isHidden: false,
					timestamp: expect.any(String),
				});
				expect(mockOnComplete).toHaveBeenCalledOnce();
			});

			it("handles success when onStart is undefined", async () => {
				mocks.submitAgentReply.mockResolvedValue({
					type: "success",
					data: { reply: "OK", terminated: false },
				});

				const { onStart: _, ...callbacksWithoutStart } = callbacks;
				await runAgentReplyWorkflow(1, "client-1", "Hello", "existing-id", callbacksWithoutStart);

				expect(mockOnUpdateMessage).toHaveBeenCalledWith("existing-id", expect.objectContaining({ text: "OK" }));
			});
		});

		describe("pending → retry → success", () => {
			it("creates pending message then updates to sent after retry (no existing msg)", async () => {
				mocks.submitAgentReply
					.mockResolvedValueOnce({ type: "success", data: { pending: true } })
					.mockResolvedValueOnce({ type: "success", data: { reply: "Here you go!", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				// First iteration: pending
				expect(mockOnCreateAgentMessage).toHaveBeenCalledTimes(1);
				const createdId = mockOnCreateAgentMessage.mock.calls[0][0].id;
				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith({
					id: createdId,
					text: labels.stillProcessing,
					state: "pending",
					timestamp: expect.any(String),
					clientMessageId: "client-1",
				});

				expect(mocks.waitForRetry).toHaveBeenCalledWith(createdId);

				// Second iteration: sent
				expect(mockOnUpdateMessage).toHaveBeenCalledWith(createdId, {
					text: "Here you go!",
					deliveryState: "sent",
					isHidden: false,
					timestamp: expect.any(String),
				});

				expect(mockOnScrollToBottom).toHaveBeenCalledTimes(2);
				expect(mockOnInvalidate).toHaveBeenCalledOnce();
				expect(mocks.clearRetry).toHaveBeenCalledWith(createdId);
			});

			it("updates existing message to pending then sent after retry", async () => {
				mocks.submitAgentReply
					.mockResolvedValueOnce({ type: "success", data: { pending: true } })
					.mockResolvedValueOnce({ type: "success", data: { reply: "Final answer", terminated: true } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", "existing-id", callbacks);

				// onStart for existing msg
				expect(mockOnStart).toHaveBeenCalledOnce();

				// First iteration: pending update
				expect(mockOnUpdateMessage).toHaveBeenNthCalledWith(1, "existing-id", {
					text: labels.stillProcessing,
					deliveryState: "pending",
					isHidden: false,
					timestamp: expect.any(String),
				});

				// Second iteration: sent update
				expect(mockOnUpdateMessage).toHaveBeenNthCalledWith(2, "existing-id", {
					text: "Final answer",
					deliveryState: "sent",
					isHidden: false,
					timestamp: expect.any(String),
				});

				expect(mockOnComplete).toHaveBeenCalledOnce();
				expect(mocks.clearRetry).toHaveBeenCalledWith("existing-id");
			});

			it("handles multiple consecutive pending responses before success", async () => {
				mocks.submitAgentReply
					.mockResolvedValueOnce({ type: "success", data: { pending: true } })
					.mockResolvedValueOnce({ type: "success", data: { pending: true } })
					.mockResolvedValueOnce({ type: "success", data: { pending: true } })
					.mockResolvedValueOnce({ type: "success", data: { reply: "Finally!", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				expect(mockOnCreateAgentMessage).toHaveBeenCalledTimes(1);
				expect(mockOnUpdateMessage).toHaveBeenCalledTimes(3);
				expect(mocks.waitForRetry).toHaveBeenCalledTimes(3);
				expect(mocks.clearRetry).toHaveBeenCalledTimes(1);
			});
		});

		describe("4xx client failure", () => {
			it("breaks immediately without creating any message when no existing id", async () => {
				mocks.submitAgentReply.mockResolvedValue({
					type: "failure",
					status: 400,
					data: { error: "Bad request" },
				});

				await runAgentReplyWorkflow(1, "client-1", "bad msg", null, callbacks);

				expect(mockOnCreateAgentMessage).not.toHaveBeenCalled();
				expect(mockOnUpdateMessage).not.toHaveBeenCalled();
				expect(mockOnScrollToBottom).not.toHaveBeenCalled();
				expect(mockOnInvalidate).not.toHaveBeenCalled();
				expect(mocks.clearRetry).not.toHaveBeenCalled();
				expect(console.warn).toHaveBeenCalledWith("Backend rejected the message:", "Bad request");
			});

			it("breaks and clears retryManager in finally when existing id", async () => {
				mocks.submitAgentReply.mockResolvedValue({
					type: "failure",
					status: 404,
					data: { error: "Not found" },
				});

				await runAgentReplyWorkflow(1, "client-1", "msg", "existing-id", callbacks);

				expect(mockOnStart).toHaveBeenCalledOnce();
				expect(mockOnUpdateMessage).not.toHaveBeenCalled();
				expect(mocks.clearRetry).toHaveBeenCalledWith("existing-id");
			});

			it("handles 4xx failure with status 400 exactly", async () => {
				mocks.submitAgentReply.mockResolvedValue({
					type: "failure",
					status: 400,
				});

				await runAgentReplyWorkflow(1, "client-1", "msg", null, callbacks);

				expect(mockOnCreateAgentMessage).not.toHaveBeenCalled();
				expect(console.warn).toHaveBeenCalled();
			});

			it("handles 4xx failure with status 499 exactly", async () => {
				mocks.submitAgentReply.mockResolvedValue({
					type: "failure",
					status: 499,
				});

				await runAgentReplyWorkflow(1, "client-1", "msg", null, callbacks);

				expect(mockOnCreateAgentMessage).not.toHaveBeenCalled();
				expect(console.warn).toHaveBeenCalled();
			});
		});

		describe("general failure → retry → success", () => {
			it("falls through to failure on 5xx, creates failed msg, then retries with success", async () => {
				mocks.submitAgentReply
					.mockResolvedValueOnce({ type: "failure", status: 500, data: { error: "Server error" } })
					.mockResolvedValueOnce({ type: "success", data: { reply: "Recovered!", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				// First iteration: failed
				expect(mockOnCreateAgentMessage).toHaveBeenCalledTimes(1);
				const failedId = mockOnCreateAgentMessage.mock.calls[0][0].id;
				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith({
					id: failedId,
					text: labels.retryFailed,
					state: "failed",
					timestamp: expect.any(String),
				});

				expect(mocks.waitForRetry).toHaveBeenCalledWith(failedId);

				// Second iteration: success
				expect(mockOnUpdateMessage).toHaveBeenCalledWith(failedId, {
					text: "Recovered!",
					deliveryState: "sent",
					isHidden: false,
					timestamp: expect.any(String),
				});

				expect(mocks.clearRetry).toHaveBeenCalledWith(failedId);
			});

			it("catches network error, logs, creates failed msg, then retries", async () => {
				const networkError = new Error("Network failure");
				mocks.submitAgentReply
					.mockRejectedValueOnce(networkError)
					.mockResolvedValueOnce({ type: "success", data: { reply: "Back online!", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				expect(console.error).toHaveBeenCalledWith("Message submission failed:", networkError);

				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith(
					expect.objectContaining({
						text: labels.retryFailed,
						state: "failed",
					}),
				);

				const createdId = mockOnCreateAgentMessage.mock.calls[0][0].id;
				expect(mockOnUpdateMessage).toHaveBeenCalledWith(createdId, expect.objectContaining({ text: "Back online!" }));
				expect(mocks.clearRetry).toHaveBeenCalledWith(createdId);
			});

			it("updates existing msg to failed on error instead of creating new one", async () => {
				mocks.submitAgentReply
					.mockRejectedValueOnce(new Error("Timeout"))
					.mockResolvedValueOnce({ type: "success", data: { reply: "OK now", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", "existing-id", callbacks);

				expect(mockOnCreateAgentMessage).not.toHaveBeenCalled();
				expect(mockOnUpdateMessage).toHaveBeenNthCalledWith(1, "existing-id", {
					text: labels.retryFailed,
					deliveryState: "failed",
					isHidden: false,
					timestamp: expect.any(String),
				});

				expect(mockOnUpdateMessage).toHaveBeenNthCalledWith(2, "existing-id", {
					text: "OK now",
					deliveryState: "sent",
					isHidden: false,
					timestamp: expect.any(String),
				});
			});

			it("treats null sendResult as failure and retries", async () => {
				mocks.submitAgentReply.mockResolvedValueOnce(null).mockResolvedValueOnce({ type: "success", data: { reply: "OK", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith(expect.objectContaining({ state: "failed", text: labels.retryFailed }));
				const failedId = mockOnCreateAgentMessage.mock.calls[0][0].id;
				expect(mockOnUpdateMessage).toHaveBeenCalledWith(failedId, expect.objectContaining({ text: "OK" }));
				expect(mockOnScrollToBottom).toHaveBeenCalledTimes(2);
			});

			it("treats success without data as failure and retries", async () => {
				mocks.submitAgentReply
					.mockResolvedValueOnce({ type: "success" })
					.mockResolvedValueOnce({ type: "success", data: { reply: "Now with data", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith(expect.objectContaining({ state: "failed" }));
				const failedId = mockOnCreateAgentMessage.mock.calls[0][0].id;
				expect(mockOnUpdateMessage).toHaveBeenCalledWith(failedId, expect.objectContaining({ text: "Now with data" }));
			});
		});

		describe("finally / cleanup", () => {
			it("clears retryManager when a retry was set up (pending flow)", async () => {
				mocks.submitAgentReply
					.mockResolvedValueOnce({ type: "success", data: { pending: true } })
					.mockResolvedValueOnce({ type: "success", data: { reply: "Done", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				const createdId = mockOnCreateAgentMessage.mock.calls[0][0].id;
				expect(mocks.clearRetry).toHaveBeenCalledWith(createdId);
			});

			it("clears retryManager when existing id passed in (direct success)", async () => {
				mocks.submitAgentReply.mockResolvedValue({
					type: "success",
					data: { reply: "Done", terminated: true },
				});

				await runAgentReplyWorkflow(1, "client-1", "Hello", "existing-id", callbacks);

				expect(mocks.clearRetry).toHaveBeenCalledWith("existing-id");
			});

			it("does not call clear when no agentMessageId was ever set (4xx with null existingId)", async () => {
				mocks.submitAgentReply.mockResolvedValue({ type: "failure", status: 400 });

				await runAgentReplyWorkflow(1, "client-1", "msg", null, callbacks);

				expect(mocks.clearRetry).not.toHaveBeenCalled();
			});
		});

		describe("callbacks contract", () => {
			it("passes correct timestamp from formatTime", async () => {
				mockFormatTime.mockReturnValue("2024-01-15T10:30:00Z");
				mocks.submitAgentReply.mockResolvedValue({
					type: "success",
					data: { reply: "Hi!", terminated: false },
				});

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				expect(mockFormatTime).toHaveBeenCalledWith(expect.any(Date));
				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith(expect.objectContaining({ timestamp: "2024-01-15T10:30:00Z" }));
			});

			it("passes clientMessageId through to onCreateAgentMessage in pending path", async () => {
				mocks.submitAgentReply
					.mockResolvedValueOnce({ type: "success", data: { pending: true } })
					.mockResolvedValueOnce({ type: "success", data: { reply: "Done", terminated: false } });

				await runAgentReplyWorkflow(1, "my-client-msg-id", "Hello", null, callbacks);

				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith(expect.objectContaining({ clientMessageId: "my-client-msg-id" }));
			});

			it("uses stillProcessing label for pending state", async () => {
				mocks.submitAgentReply
					.mockResolvedValueOnce({ type: "success", data: { pending: true } })
					.mockResolvedValueOnce({ type: "success", data: { reply: "Done", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith(expect.objectContaining({ text: labels.stillProcessing }));
			});

			it("uses retryFailed label for failure state", async () => {
				mocks.submitAgentReply
					.mockRejectedValueOnce(new Error("Fail"))
					.mockResolvedValueOnce({ type: "success", data: { reply: "OK", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				expect(mockOnCreateAgentMessage).toHaveBeenCalledWith(expect.objectContaining({ text: labels.retryFailed }));
			});

			it("awaits onScrollToBottom before waitForRetry on pending", async () => {
				const scrollOrder: string[] = [];
				mockOnScrollToBottom.mockImplementation(async () => {
					scrollOrder.push("scroll");
				});
				mocks.waitForRetry.mockImplementation(async () => {
					scrollOrder.push("retry");
				});

				mocks.submitAgentReply
					.mockResolvedValueOnce({ type: "success", data: { pending: true } })
					.mockResolvedValueOnce({ type: "success", data: { reply: "Done", terminated: false } });

				await runAgentReplyWorkflow(1, "client-1", "Hello", null, callbacks);

				// Iteration 1 (pending): scroll, then retry
				// Iteration 2 (success): scroll
				expect(scrollOrder).toEqual(["scroll", "retry", "scroll"]);
			});
		});
	});
});
