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

vi.mock("$lib/server/db", () => ({
	db: {
		query: { userApiKey: { findFirst: vi.fn().mockResolvedValue(null) } },
	},
}));

vi.mock("$lib/server/api-key-crypto", () => ({
	decryptApiKey: vi.fn((c: string) => `decrypted:${c}`),
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

function createToolCallResponse(content: string | null) {
	return new Response(
		JSON.stringify({
			id: "chatcmpl-tool-test",
			model: "test-model",
			choices: [
				{
					message: {
						role: "assistant",
						content,
						tool_calls: [
							{
								id: "call-1",
								type: "function",
								function: {
									name: "terminate_conversation",
									arguments: '{"reason":"goodbye"}',
								},
							},
						],
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

function getHeader(headers: RequestInit["headers"], name: string) {
	if (headers instanceof Headers) return headers.get(name);
	if (Array.isArray(headers)) return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
	return headers?.[name] ?? headers?.[name.toLowerCase()];
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

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		await expect(createStructuredOutput(schema, [] as any)).rejects.toThrow("messages must contain at least one item");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("calls fetch with validated messages and parses JSON text", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"content":"ok"}'));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
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

		expect(getHeader(init.headers, "authorization")).toBe("Bearer test-key");

		expect(payload).toEqual(
			expect.objectContaining({
				model: "test-model",
				temperature: 0.3,
				max_tokens: 128,
				messages,
			}),
		);
	});

	it("merges adjacent same-role messages before sending to OpenAI-compatible providers", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"reply":"ok","terminate":false}'));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		await createStructuredOutput(schema, [
			{ role: "system", content: "Return JSON." },
			{ role: "user", content: "Learner said hello." },
			{ role: "user", content: "Learner said goodbye." },
		]);

		const firstCall = fetchMock.mock.calls[0];
		if (!firstCall) throw new Error("fetch was not called");
		const payload = JSON.parse(String((firstCall[1] as RequestInit).body));

		expect(payload.messages).toEqual([
			{ role: "system", content: "Return JSON." },
			{
				role: "user",
				content: expect.stringContaining("Learner said hello.\n\nLearner said goodbye."),
			},
		]);
	});

	it("logs request and response bodies only when LLM_DEBUG is enabled", async () => {
		mockEnv.LLM_DEBUG = "true";
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"content":"ok"}'));
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		await createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }]);

		expect(infoSpy).toHaveBeenCalledWith("[llm-debug] request", expect.stringContaining('"url": "https://example.com/v1/chat/completions"'));
		expect(infoSpy).toHaveBeenCalledWith("[llm-debug] response", expect.stringContaining('"status": 200'));

		const loggedText = infoSpy.mock.calls.map((call) => call.join(" ")).join("\n");
		expect(loggedText).not.toContain("test-key");
		expect(loggedText).not.toContain("Authorization");
	});

	it.each(["1", "yes", "on"])("enables debug logging when LLM_DEBUG=%s", async (value) => {
		mockEnv.LLM_DEBUG = value;
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"content":"ok"}'));
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		await createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }]);

		expect(infoSpy).toHaveBeenCalled();
	});
	it("recovers provider output with a newline between the opening quote and key name", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"\nreply":"¡Hola!","terminate":false}'));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
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

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		const result = await createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }]);

		expect(result).toEqual({ reply: "Recovered", terminate: false });
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const secondCall = fetchMock.mock.calls[1];
		if (!secondCall) throw new Error("second fetch was not called");

		const secondPayload = JSON.parse(String((secondCall[1] as RequestInit).body));

		expect(secondPayload.temperature).toBeUndefined();
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

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		await expect(createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }])).rejects.toThrow(
			"LLM returned invalid structured JSON",
		);
	});

	it("rethrows first error when retry JSON parses successfully but fails schema validation", async () => {
		const fetchMock = vi
			.fn<FetchLike>()
			.mockResolvedValueOnce(createChatCompletionResponse('{"content":"bad"}'))
			.mockResolvedValueOnce(createChatCompletionResponse('{"content":"still bad"}'));

		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		await expect(createStructuredOutput(schema, [{ role: "system", content: "Return JSON." }])).rejects.toThrow(
			"LLM returned invalid structured JSON",
		);
	});
});

describe("createToolChat", () => {
	type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

	beforeEach(() => {
		vi.restoreAllMocks();
		mockEnv.LLM_DEBUG = "";
	});

	it("sends function tools and returns plain text plus parsed tool calls", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createToolCallResponse("Goodbye!"));
		vi.stubGlobal("fetch", fetchMock);

		const { createToolChat } = await import("$lib/server/llm");
		const result = await createToolChat(
			[{ role: "system", content: "Reply plainly." }],
			[
				{
					type: "function",
					function: {
						name: "terminate_conversation",
						description: "End the chat.",
						parameters: { type: "object", properties: {} },
					},
				},
			],
		);

		expect(result.content).toBe("Goodbye!");
		expect(result.toolCalls).toEqual([
			expect.objectContaining({
				id: "call-1",
				name: "terminate_conversation",
				arguments: { reason: "goodbye" },
			}),
		]);

		const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
		expect(payload.tool_choice).toBe("auto");
		expect(payload.parallel_tool_calls).toBe(false);
		expect(payload.tools[0].function.name).toBe("terminate_conversation");
	});

	it("allows empty assistant content when a tool call is returned", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createToolCallResponse(null));
		vi.stubGlobal("fetch", fetchMock);

		const { createToolChat } = await import("$lib/server/llm");
		const result = await createToolChat(
			[{ role: "system", content: "Reply plainly." }],
			[
				{
					type: "function",
					function: { name: "terminate_conversation", parameters: { type: "object", properties: {} } },
				},
			],
		);

		expect(result.content).toBe("");
		expect(result.toolCalls[0]?.name).toBe("terminate_conversation");
	});
});

// ── Core LLM function (createChatCompletion) ─────────────────────────
describe("createChatCompletion", () => {
	type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

	beforeEach(() => {
		vi.restoreAllMocks();
		mockEnv.LLM_DEBUG = "";
	});

	it("throws on non-200 API response", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => new Response("Server Error", { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		await expect(createStructuredOutput(schema, [{ role: "system", content: "hi" }])).rejects.toThrow("OpenAI API error (500)");
	});

	it("throws on API error in response body", async () => {
		const fetchMock = vi.fn<FetchLike>(
			async () =>
				new Response(JSON.stringify({ error: { message: "Model not found" } }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		await expect(createStructuredOutput(schema, [{ role: "system", content: "hi" }])).rejects.toThrow("OpenAI API error: Model not found");
	});

	it("throws on empty content in response", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse(""));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		await expect(createStructuredOutput(schema, [{ role: "system", content: "hi" }])).rejects.toThrow("LLM returned empty content");
	});

	it("uses BYOK config when userId is provided and user has a valid API key", async () => {
		const { db: mockDb } = await import("$lib/server/db");
		vi.mocked(mockDb.query.userApiKey.findFirst).mockResolvedValueOnce({
			userId: "byok-user",
			encryptedKey: "test-cipher",
			baseUrl: "https://user-api.example.com/v1",
			model: "user-model",
		} as any);

		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"content":"ok"}'));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		const result = await createStructuredOutput(schema, [{ role: "system", content: "hi" }], {}, "byok-user");

		expect(result).toEqual({ content: "ok" });
		// Verify it used the BYOK config URL
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url] = fetchMock.mock.calls[0] as unknown as [string];
		expect(url).toBe("https://user-api.example.com/v1/chat/completions");
	});

	it("falls back to env config when user has no BYOK row", async () => {
		const { db: mockDb } = await import("$lib/server/db");
		// findFirst returns undefined — no BYOK row at all
		vi.mocked(mockDb.query.userApiKey.findFirst).mockResolvedValueOnce(undefined);

		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"content":"ok"}'));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		const result = await createStructuredOutput(schema, [{ role: "system", content: "hi" }], {}, "byok-user");

		expect(result).toEqual({ content: "ok" });
		const [url] = fetchMock.mock.calls[0] as unknown as [string];
		expect(url).toBe("https://example.com/v1/chat/completions"); // env URL
	});

	it("throws on network error from fetch", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => {
			throw new Error("ECONNREFUSED");
		});
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		await expect(createStructuredOutput(schema, [{ role: "system", content: "hi" }])).rejects.toThrow("ECONNREFUSED");
	});

	it("handles debugLog JSON.stringify failure gracefully", async () => {
		mockEnv.LLM_DEBUG = "true";
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse('{"content":"ok"}'));
		vi.stubGlobal("fetch", fetchMock);

		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });

		await createStructuredOutput(schema, [{ role: "system", content: "hi" }]);

		expect(infoSpy).toHaveBeenCalled();
	});
});

describe("validateMessages", () => {
	it("rejects empty array", async () => {
		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });
		await expect(createStructuredOutput(schema, [])).rejects.toThrow("messages must contain at least one item");
	});

	it("rejects invalid role", async () => {
		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });
		await expect(createStructuredOutput(schema, [{ role: "invalid" as any, content: "hi" }])).rejects.toThrow("each message.role must be one of");
	});

	it("rejects empty or whitespace-only content", async () => {
		const { createStructuredOutput } = await import("$lib/server/llm");
		const schema = z.object({ content: z.string() });
		await expect(createStructuredOutput(schema, [{ role: "user", content: "" }])).rejects.toThrow("each message.content must be a non-empty string");
		await expect(createStructuredOutput(schema, [{ role: "user", content: "   " }])).rejects.toThrow(
			"each message.content must be a non-empty string",
		);
	});
});
