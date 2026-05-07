import { beforeEach, describe, expect, it, vi } from "vitest";
import { postAction, submitAgentReply } from "$lib/components/practice-ui/apiService";

global.fetch = vi.fn();
vi.mock("$app/forms", () => ({
	deserialize: vi.fn((text) => JSON.parse(text)),
}));
describe("apiService", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("postAction sends correct FormData and parses response", async () => {
		const mockResponse = { type: "success", data: { sessionId: 123 } };
		(global.fetch as any).mockResolvedValue({
			text: () => Promise.resolve(JSON.stringify(mockResponse)),
		});

		const result = await postAction("start", 123);
		expect(result.type).toBe("success");
		expect(global.fetch).toHaveBeenCalledWith("?/start", expect.objectContaining({ method: "POST" }));
	});

	it("submitAgentReply sends message properly", async () => {
		const mockResponse = { type: "success", data: { reply: "Hi" } };
		(global.fetch as any).mockResolvedValue({
			text: () => Promise.resolve(JSON.stringify(mockResponse)),
		});

		const result = await submitAgentReply(1, "Hello Agent", "msg-id-1");
		expect(result.type).toBe("success");
		expect(global.fetch).toHaveBeenCalledWith("?/send", expect.any(Object));
	});
});
