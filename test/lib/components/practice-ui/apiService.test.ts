import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_REPLY_TIMEOUT_MS, postAction, submitAgentReply } from "$lib/components/practice-ui/apiService";

global.fetch = vi.fn();
vi.mock("$app/forms", () => ({
	deserialize: vi.fn((text) => JSON.parse(text)),
}));

describe("apiService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("postAction", () => {
		it("sends correct FormData and parses response", async () => {
			const mockResponse = { type: "success", data: { sessionId: 123 } };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			const result = await postAction("start", 123);
			expect(result.type).toBe("success");
			expect(global.fetch).toHaveBeenCalledWith("?/start", expect.objectContaining({ method: "POST" }));
		});

		it("handles null sessionId", async () => {
			const mockResponse = { type: "success", data: {} };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			await postAction("complete", null);
			expect(global.fetch).toHaveBeenCalledWith("?/complete", expect.objectContaining({ method: "POST" }));
		});

		it("handles empty string sessionId", async () => {
			const mockResponse = { type: "success", data: {} };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			await postAction("complete", "");
			expect(global.fetch).toHaveBeenCalledWith("?/complete", expect.objectContaining({ method: "POST" }));
		});

		it("handles zero sessionId", async () => {
			const mockResponse = { type: "success", data: { sessionId: 0 } };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			await postAction("start", 0);
			expect(global.fetch).toHaveBeenCalledWith("?/start", expect.objectContaining({ method: "POST" }));
		});

		it("sends FormData with sessionId when provided", async () => {
			const mockResponse = { type: "success", data: {} };
			(fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			await postAction("start", 12345);

			const fetchCall = (global.fetch as any).mock.calls[0];
			const formData = fetchCall[1].body;

			expect(formData instanceof FormData).toBe(true);
			expect(formData.get("sessionId")).toBe("12345");
		});
	});

	describe("submitAgentReply", () => {
		it("sends message properly with all required fields", async () => {
			const mockResponse = { type: "success", data: { reply: "Hi" } };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			const result = await submitAgentReply(1, "Hello Agent", "msg-id-1");
			expect(result.type).toBe("success");
			expect(global.fetch).toHaveBeenCalledWith("?/send", expect.any(Object));
		});

		it("includes correct FormData fields", async () => {
			const mockResponse = { type: "success", data: { reply: "Response" } };
			(fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			await submitAgentReply(999, "Test message", "client-msg-123");

			const fetchCall = (global.fetch as any).mock.calls[0];
			const formData = fetchCall[1].body;

			expect(formData.get("sessionId")).toBe("999");
			expect(formData.get("message")).toBe("Test message");
			expect(formData.get("clientMessageId")).toBe("client-msg-123");
		});

		it("handles string sessionId", async () => {
			const mockResponse = { type: "success", data: { reply: "Response" } };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			await submitAgentReply("abc-123", "Message", "msg-id");

			const fetchCall = (global.fetch as any).mock.calls[0];
			expect(fetchCall[1].body.get("sessionId")).toBe("abc-123");
		});

		it("throws timeout error when request exceeds timeout", async () => {
			// Mock AbortController to simulate timeout
			const mockAbortError = new DOMException("Aborted", "AbortError");

			(global.fetch as any).mockImplementation(() => {
				return Promise.reject(mockAbortError);
			});

			await expect(submitAgentReply(1, "Test", "msg-id")).rejects.toThrow(`Agent reply timed out after ${AGENT_REPLY_TIMEOUT_MS / 1000}s`);
		});

		it("handles network errors", async () => {
			(global.fetch as any).mockRejectedValue(new Error("Network error"));

			await expect(submitAgentReply(1, "Test", "msg-id")).rejects.toThrow("Network error");
		});

		it("clears timeout on successful response", async () => {
			const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

			const mockResponse = { type: "success", data: { reply: "Hi" } };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			await submitAgentReply(1, "Hello", "msg-id");

			expect(clearTimeoutSpy).toHaveBeenCalled();
		});

		it("clears timeout on error response", async () => {
			const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

			(global.fetch as any).mockRejectedValue(new Error("Network error"));

			await expect(submitAgentReply(1, "Hello", "msg-id")).rejects.toThrow();

			expect(clearTimeoutSpy).toHaveBeenCalled();
		});

		it("handles failure response from server", async () => {
			const mockResponse = { type: "failure", status: 500, data: { error: "Server error" } };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			const result = await submitAgentReply(1, "Test", "msg-id");
			expect(result.type).toBe("failure");
			expect(result.status).toBe(500);
		});
	});

	describe("AGENT_REPLY_TIMEOUT_MS", () => {
		it("exports timeout constant", () => {
			expect(AGENT_REPLY_TIMEOUT_MS).toBe(25000);
		});
	});
});
