import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockChatJson, mockChatText } = vi.hoisted(() => ({ mockChatJson: vi.fn(), mockChatText: vi.fn() }));
vi.mock("$lib/server/llm/client", () => ({ chatJson: mockChatJson, chatText: mockChatText }));

import { defineLlmRecipe } from "$lib/server/llm/recipe";
import { type LlmCallInterceptor, type LlmCallRecord, runLlmRecipe, setLlmCallInterceptor } from "$lib/server/llm/run";

const recipe = defineLlmRecipe({
	id: "test.echo",
	version: 1,
	title: "Echo",
	reasoningEffort: "low",
	output: { kind: "json", schema: z.object({ n: z.number() }) },
	slots: { system: { label: "System", template: "Answer in {{language}}.", variables: ["language"] } },
	build: (input: { language: string; n: number }, slot) => [
		{ role: "system", content: slot("system", { language: input.language }) },
		{ role: "user", content: String(input.n) },
	],
	options: { temperature: 0.3 },
	finalize: (value, input) => {
		if (value.n !== input.n) throw new Error("mismatch");
		return value.n * 2;
	},
});

function jsonResponse(value: unknown) {
	return { content: JSON.stringify(value), finishReason: "stop", raw: {}, value, requestMessages: [], repair: null };
}

function interceptor(plan: Awaited<ReturnType<LlmCallInterceptor["prepare"]>>) {
	const records: LlmCallRecord[] = [];
	const installed: LlmCallInterceptor = { prepare: vi.fn(async () => plan), record: (record) => void records.push(record) };
	setLlmCallInterceptor(installed);
	return { records, installed };
}

afterEach(() => {
	setLlmCallInterceptor(null);
	vi.clearAllMocks();
});

describe("runLlmRecipe", () => {
	it("runs the recipe as declared without an interceptor", async () => {
		mockChatJson.mockResolvedValueOnce(jsonResponse({ n: 2 }));
		const response = await runLlmRecipe(recipe, { language: "French", n: 2 }, { userId: "u1" });
		expect(response.value).toBe(4);
		expect(mockChatJson).toHaveBeenCalledWith(
			expect.objectContaining({
				messages: [
					{ role: "system", content: "Answer in French." },
					{ role: "user", content: "2" },
				],
				options: { reasoningEffort: "low", temperature: 0.3 },
				userId: "u1",
				provider: undefined,
			}),
		);
	});

	it("applies a staff override and records the call as an override", async () => {
		const provider = { id: "alt", apiKey: "k", baseUrl: "https://alt.test/v1", model: "m" };
		const { records } = interceptor({
			capture: true,
			override: { id: 7, variant: { slots: { system: "Reply in {{language}}!" }, provider, options: { temperature: 1, reasoningEffort: "high" } } },
		});
		mockChatJson.mockResolvedValueOnce(jsonResponse({ n: 1 }));
		await runLlmRecipe(recipe, { language: "Spanish", n: 1 }, { userId: "u1", subjects: { taskId: 3 } });

		const request = mockChatJson.mock.calls[0][0];
		expect(request.messages[0].content).toBe("Reply in Spanish!");
		expect(request.options).toEqual({ reasoningEffort: "high", temperature: 1 });
		expect(request.provider).toBe(provider);
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({ origin: "override", overrideId: 7, value: 2, error: null, subjects: { taskId: 3 } });
	});

	it("records finalize failures with the parsed value and rethrows", async () => {
		const { records } = interceptor({ capture: true });
		mockChatJson.mockResolvedValueOnce(jsonResponse({ n: 5 }));
		await expect(runLlmRecipe(recipe, { language: "French", n: 1 })).rejects.toThrow("mismatch");
		expect(records[0]).toMatchObject({ origin: "app", value: { n: 5 }, error: expect.any(Error), errorStage: "finalize" });
	});

	it("records provider failures and does not record uncaptured calls", async () => {
		const { records } = interceptor({ capture: true });
		mockChatJson.mockRejectedValueOnce(new Error("down"));
		await expect(runLlmRecipe(recipe, { language: "French", n: 1 })).rejects.toThrow("down");
		expect(records[0]).toMatchObject({ response: null, error: expect.any(Error), errorStage: "provider" });

		interceptor({ capture: false });
		mockChatJson.mockResolvedValueOnce(jsonResponse({ n: 1 }));
		await runLlmRecipe(recipe, { language: "French", n: 1 });
		expect(records).toHaveLength(1);
	});

	it("ignores interceptor failures", async () => {
		setLlmCallInterceptor({
			prepare: async () => {
				throw new Error("db down");
			},
			record: () => {
				throw new Error("db down");
			},
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		mockChatJson.mockResolvedValueOnce(jsonResponse({ n: 1 }));
		await expect(runLlmRecipe(recipe, { language: "French", n: 1 })).resolves.toMatchObject({ value: 2 });
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("keeps the response and marks the stage when a text parser rejects it", async () => {
		const { records } = interceptor({ capture: true });
		const strict = defineLlmRecipe({
			id: "test.strict",
			version: 1,
			title: "Strict",
			reasoningEffort: "low",
			output: {
				kind: "text",
				parse: (): string => {
					throw new Error("too long");
				},
			},
			build: () => [{ role: "user", content: "hi" }],
		});
		mockChatText.mockResolvedValueOnce({ content: "<feedback>…", finishReason: "stop", raw: {}, usage: { completionTokens: 9 } });
		await expect(runLlmRecipe(strict, {})).rejects.toThrow("too long");
		expect(records[0]).toMatchObject({
			errorStage: "parse",
			response: { content: "<feedback>…", usage: { completionTokens: 9 } },
			attempts: [{ content: "<feedback>…", errors: ["too long"] }],
		});
	});

	it("marks build failures before any request is sent", async () => {
		const { records } = interceptor({ capture: true, override: { id: 1, variant: { slots: { system: "{{missing}}" } } } });
		await expect(runLlmRecipe(recipe, { language: "French", n: 1 }, { userId: "u1" })).rejects.toThrow("missing");
		expect(mockChatJson).not.toHaveBeenCalled();
		expect(records[0]).toMatchObject({ errorStage: "build", attempts: [] });
	});

	it("parses text recipes with the recipe's parser", async () => {
		const textRecipe = defineLlmRecipe({
			id: "test.text",
			version: 1,
			title: "Text",
			reasoningEffort: "low",
			output: { kind: "text", parse: (content: string) => content.toUpperCase() },
			build: () => [{ role: "user", content: "hi" }],
		});
		mockChatText.mockResolvedValueOnce({ content: "ok", finishReason: "stop", raw: {} });
		await expect(runLlmRecipe(textRecipe, {})).resolves.toMatchObject({ value: "OK", repair: null });
	});
});
