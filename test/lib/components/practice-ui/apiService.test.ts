import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeAction, postAction, requestAgentOpeningAction } from "$lib/components/practice-ui/apiService";
import { MAIL_AGENT_OPENING_MESSAGE } from "$lib/components/practice-ui/mail/constants";

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

		it("omits sessionId from FormData when null", async () => {
			const mockResponse = { type: "success", data: {} };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			await postAction("complete", null);

			const fetchCall = (global.fetch as any).mock.calls[0];
			const formData = fetchCall[1].body as FormData;
			expect(formData.get("sessionId")).toBeNull();
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

	describe("completeAction", () => {
		it("posts to the shared complete action", async () => {
			const mockResponse = { type: "success", data: { feedback: { content: "Done" } } };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			const result = await completeAction(99);

			expect(result).toEqual(mockResponse);
			const fetchCall = (global.fetch as any).mock.calls[0];
			expect(fetchCall[0]).toBe("?/complete");
			expect(fetchCall[1].body.get("sessionId")).toBe("99");
		});
	});

	describe("requestAgentOpeningAction", () => {
		it("posts the Mail join trigger with deterministic client id", async () => {
			const mockResponse = { type: "success", data: { reply: "Hello" } };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			const result = await requestAgentOpeningAction(42);

			expect(result).toEqual(mockResponse);
			const fetchCall = (global.fetch as any).mock.calls[0];
			expect(fetchCall[0]).toBe("?/send");
			expect(fetchCall[1].body.get("sessionId")).toBe("42");
			expect(fetchCall[1].body.get("message")).toBe("*User joined the server*");
			expect(fetchCall[1].body.get("clientMessageId")).toBe("join-42");
		});

		it("can post the Mail-specific agent opening trigger", async () => {
			const mockResponse = { type: "success", data: { reply: "Hello" } };
			(global.fetch as any).mockResolvedValue({
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			await requestAgentOpeningAction(42, MAIL_AGENT_OPENING_MESSAGE);

			const fetchCall = (global.fetch as any).mock.calls[0];
			expect(fetchCall[1].body.get("message")).toBe(MAIL_AGENT_OPENING_MESSAGE);
			expect(fetchCall[1].body.get("clientMessageId")).toBe("join-42");
		});
	});
});
