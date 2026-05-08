import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postAction } from "$lib/components/practice-ui/apiService";

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
});
