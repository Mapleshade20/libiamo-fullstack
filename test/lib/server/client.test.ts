import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockGenerateText, mockOutputObject, mockCreateOpenAICompatible } = vi.hoisted(() => ({
	mockGenerateText: vi.fn(),
	mockOutputObject: vi.fn(() => "mock-output"),
	mockCreateOpenAICompatible: vi.fn(() => vi.fn(() => "mock-model")),
}));

vi.mock("$env/dynamic/private", () => ({
	env: {
		OPENAI_API_KEY: "test-key",
		OPENAI_BASE_URL: "https://example.com/v1",
		OPENAI_MODEL: "test-model",
	},
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
	createOpenAICompatible: mockCreateOpenAICompatible,
}));

vi.mock("ai", () => ({
	generateText: mockGenerateText,
	Output: {
		object: mockOutputObject,
	},
}));

describe("client createStructuredOutput", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("validates messages before provider call", async () => {
		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ content: z.string() });

		await expect(createStructuredOutput(schema, [] as any)).rejects.toThrow("messages must contain at least one item");
		expect(mockGenerateText).not.toHaveBeenCalled();
	});

	it("calls generateText with validated messages", async () => {
		mockGenerateText.mockResolvedValue({ output: { content: "ok" } });

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ content: z.string() });
		const messages = [{ role: "system" as const, content: "You are a tutor." }];

		const result = await createStructuredOutput(schema, messages, { temperature: 0.3, maxTokens: 128 });

		expect(result).toEqual({ content: "ok" });
		expect(mockOutputObject).toHaveBeenCalledTimes(1);
		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "mock-model",
				messages,
				temperature: 0.3,
				maxOutputTokens: 128,
			}),
		);
	});
});
