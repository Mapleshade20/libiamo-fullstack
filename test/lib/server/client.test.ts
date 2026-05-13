import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {
		OPENAI_API_KEY: "test-key",
		OPENAI_BASE_URL: "https://example.com/v1",
		OPENAI_MODEL: "test-model",
		LLM_DEBUG: "",
	},
}));

vi.mock("$env/dynamic/private", () => ({
	env: mockEnv,
}));

function createChatCompletionResponse(content: string) {
	return new Response(
		JSON.stringify({
			id: "chatcmpl-test",
			model: "test-model",
			choices: [
				{
					message: {
						role: "assistant",
						content,
					},
				},
			],
		}),
		{
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		},
	);
}

describe("client createStructuredOutput", () => {
	type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

	beforeEach(() => {
		vi.restoreAllMocks();
		mockEnv.LLM_DEBUG = "";
	});

	it("validates messages before provider call", async () => {
		const fetchMock = vi.fn<FetchLike>();
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ content: z.string() });

		await expect(createStructuredOutput(schema, [] as any)).rejects.toThrow("messages must contain at least one item");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("calls fetch with validated messages and parses JSON text", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"content":"ok"}'));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ content: z.string() });
		const messages = [{ role: "system" as const, content: "You are a tutor." }];

		const result = await createStructuredOutput(schema, messages, {
			temperature: 0.3,
			maxTokens: 128,
		});

		expect(result).toEqual({ content: "ok" });

		expect(fetchMock).toHaveBeenCalledTimes(1);

		const firstCall = fetchMock.mock.calls[0];
		if (!firstCall) throw new Error("fetch was not called");

		const url = firstCall[0] as string;
		const init = firstCall[1] as RequestInit;
		const payload = JSON.parse(String(init.body));

		expect(url).toBe("https://example.com/v1/chat/completions");
		expect(init.method).toBe("POST");

		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization ?? headers.authorization).toBe("Bearer test-key");

		expect(payload).toEqual(
			expect.objectContaining({
				model: "test-model",
				temperature: 0.3,
				max_tokens: 128,
				messages: [
					...messages,
					expect.objectContaining({
						role: "user",
						content: expect.stringContaining("valid JSON object"),
					}),
				],
			}),
		);
	});

	it("merges adjacent same-role messages before sending to OpenAI-compatible providers", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"reply":"ok","terminate":false}'));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		await createStructuredOutput(schema, [
			{ role: "system", content: "Return JSON." },
			{ role: "user", content: "Learner said hello." },
		]);

		const firstCall = fetchMock.mock.calls[0];
		if (!firstCall) throw new Error("fetch was not called");
		const payload = JSON.parse(String((firstCall[1] as RequestInit).body));

		expect(payload.messages).toEqual([
			{ role: "system", content: "Return JSON." },
			{
				role: "user",
				content: expect.stringContaining("Learner said hello.\n\nReturn ONLY one valid JSON object"),
			},
		]);
	});

	it("logs request and response bodies only when LLM_DEBUG is enabled", async () => {
		mockEnv.LLM_DEBUG = "true";
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"content":"ok"}'));
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ content: z.string() });

		await createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }]);

		expect(infoSpy).toHaveBeenCalledWith("[llm-debug] request", expect.stringContaining('"url": "https://example.com/v1/chat/completions"'));
		expect(infoSpy).toHaveBeenCalledWith("[llm-debug] response", expect.stringContaining('"status": 200'));

		const loggedText = infoSpy.mock.calls.map((call) => call.join(" ")).join("\n");
		expect(loggedText).not.toContain("test-key");
		expect(loggedText).not.toContain("Authorization");
	});
	it("recovers provider output with a newline between the opening quote and key name", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"\nreply":"¡Hola!","terminate":false}'));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		const result = await createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }]);

		expect(result).toEqual({ reply: "¡Hola!", terminate: false });
	});

	it("retries when the first JSON response is incomplete", async () => {
		const fetchMock = vi
			.fn<FetchLike>()
			.mockResolvedValueOnce(createChatCompletionResponse('{"\nreply":": "}'))
			.mockResolvedValueOnce(createChatCompletionResponse('{"reply":"Recovered","terminate":false}'));

		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		const result = await createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }]);

		expect(result).toEqual({ reply: "Recovered", terminate: false });
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const secondCall = fetchMock.mock.calls[1];
		if (!secondCall) throw new Error("second fetch was not called");

		const secondPayload = JSON.parse(String((secondCall[1] as RequestInit).body));

		expect(secondPayload.temperature).toBe(0);
		expect(secondPayload.messages).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					content: expect.stringContaining("previous response was invalid"),
				}),
			]),
		);
	});

	it("rethrows structured output errors when retry parsing cannot recover", async () => {
		const fetchMock = vi
			.fn<FetchLike>()
			.mockResolvedValueOnce(createChatCompletionResponse("not json"))
			.mockResolvedValueOnce(createChatCompletionResponse("still not json"));

		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/client");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		await expect(createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }])).rejects.toThrow(
			"LLM returned invalid structured JSON",
		);
	});
});
