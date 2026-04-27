import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockGenerateText, mockCreateOpenAICompatible } = vi.hoisted(() => ({
	mockGenerateText: vi.fn(),
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

	it("calls generateText with validated messages and parses JSON text", async () => {
		mockGenerateText.mockResolvedValue({ text: '{"content":"ok"}' });

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ content: z.string() });
		const messages = [{ role: "system" as const, content: "You are a tutor." }];

		const result = await createStructuredOutput(schema, messages, { temperature: 0.3, maxTokens: 128 });

		expect(result).toEqual({ content: "ok" });
		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "mock-model",
				messages: [...messages, expect.objectContaining({ role: "user", content: expect.stringContaining("valid JSON object") })],
				temperature: 0.3,
				maxOutputTokens: 128,
			}),
		);
	});

	it("recovers provider output with a newline between the opening quote and key name", async () => {
		mockGenerateText.mockResolvedValue({ text: '{"\nreply":"¡Hola!","terminate":false}' });

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		const result = await createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }]);

		expect(result).toEqual({ reply: "¡Hola!", terminate: false });
	});

	it("retries when the first JSON response is incomplete", async () => {
		mockGenerateText.mockResolvedValueOnce({ text: '{"\nreply":": "}' }).mockResolvedValueOnce({ text: '{"reply":"Recovered","terminate":false}' });

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		const result = await createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }]);

		expect(result).toEqual({ reply: "Recovered", terminate: false });
		expect(mockGenerateText).toHaveBeenCalledTimes(2);
		expect(mockGenerateText).toHaveBeenLastCalledWith(
			expect.objectContaining({
				temperature: 0,
				messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining("previous response was invalid") })]),
			}),
		);
	});

	it("rethrows structured output errors when retry parsing cannot recover", async () => {
		mockGenerateText.mockResolvedValueOnce({ text: "not json" }).mockResolvedValueOnce({ text: "still not json" });

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		await expect(createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }])).rejects.toThrow(
			"LLM returned invalid structured JSON",
		);
	});
});
