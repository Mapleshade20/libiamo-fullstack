import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {
		OPENAI_API_KEY: "test-key",
		OPENAI_BASE_URL: "https://example.com/v1",
		OPENAI_MODEL: "test-model",
		LLM_DEBUG: "",
		BETTER_AUTH_SECRET: "test-secret-for-api-key-encryption",
	},
}));

vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

const { mockUserQuotaFindFirst, mockDbUpdate, mockDbInsert } = vi.hoisted(() => {
	const mockUserQuotaFindFirst = vi.fn().mockResolvedValue({ trialTokensLeft: 50_000, trialTokensTotal: 50_000 });
	const mockDbUpdate = vi.fn(() => ({
		set: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn().mockResolvedValue([{ trialTokensLeft: 49_999, trialTokensTotal: 50_000 }]),
			})),
		})),
	}));
	const mockDbInsert = vi.fn(() => ({
		values: vi.fn(() => ({
			onConflictDoNothing: vi.fn(() => ({
				returning: vi.fn().mockResolvedValue([{ trialTokensLeft: 50_000, trialTokensTotal: 50_000 }]),
			})),
		})),
	}));
	return { mockUserQuotaFindFirst, mockDbUpdate, mockDbInsert };
});

vi.mock("$lib/server/db", () => ({
	db: {
		query: {
			userApiKey: { findFirst: vi.fn().mockResolvedValue(null) },
			userQuota: { findFirst: mockUserQuotaFindFirst },
		},
		update: mockDbUpdate,
		insert: mockDbInsert,
	},
}));

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function createChatCompletionResponse(content: string | null, extraMessage: Record<string, unknown> = {}, extraRoot: Record<string, unknown> = {}) {
	return new Response(
		JSON.stringify({
			id: "chatcmpl-test",
			model: "test-model",
			choices: [
				{
					finish_reason: "stop",
					message: {
						role: "assistant",
						content,
						...extraMessage,
					},
				},
			],
			...extraRoot,
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
}

function createToolCallResponse(content: string | null) {
	return createChatCompletionResponse(content, {
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
	});
}

function getHeader(headers: RequestInit["headers"], name: string) {
	if (headers instanceof Headers) return headers.get(name);
	if (Array.isArray(headers)) return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
	return headers?.[name] ?? headers?.[name.toLowerCase()];
}

beforeEach(() => {
	vi.restoreAllMocks();
	mockEnv.OPENAI_API_KEY = "test-key";
	mockEnv.OPENAI_BASE_URL = "https://example.com/v1";
	mockEnv.OPENAI_MODEL = "test-model";
	mockEnv.LLM_DEBUG = "";
	mockEnv.BETTER_AUTH_SECRET = "test-secret-for-api-key-encryption";
	mockUserQuotaFindFirst.mockResolvedValue({ trialTokensLeft: 50_000, trialTokensTotal: 50_000 });
	mockDbUpdate.mockClear();
	mockDbInsert.mockClear();
});

describe("chatText", () => {
	it("sends validated messages exactly and returns trimmed content", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse("  hello  "));
		vi.stubGlobal("fetch", fetchMock);

		const { chatText } = await import("$lib/server/llm");
		const result = await chatText({
			messages: [
				{ role: "system", content: "  You are a tutor.  " },
				{ role: "user", content: "  Hi  " },
			],
			options: { temperature: 0.3, maxTokens: 128 },
		});

		expect(result.content).toBe("hello");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://example.com/v1/chat/completions");
		expect(init.method).toBe("POST");
		expect(getHeader(init.headers, "authorization")).toBe("Bearer test-key");
		expect(JSON.parse(String(init.body))).toEqual(
			expect.objectContaining({
				model: "test-model",
				temperature: 0.3,
				max_tokens: 128,
				messages: [
					{ role: "system", content: "  You are a tutor.  " },
					{ role: "user", content: "  Hi  " },
				],
			}),
		);
	});

	it("preserves adjacent same-role messages before sending", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse("ok"));
		vi.stubGlobal("fetch", fetchMock);

		const { chatText } = await import("$lib/server/llm");
		await chatText({
			messages: [
				{ role: "system", content: "Return text." },
				{ role: "user", content: "Learner said hello." },
				{ role: "user", content: "Learner said goodbye." },
			],
		});

		const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
		expect(payload.max_tokens).toBe(8192);
		expect(payload.messages).toEqual([
			{ role: "system", content: "Return text." },
			{ role: "user", content: "Learner said hello." },
			{ role: "user", content: "Learner said goodbye." },
		]);
	});

	it("validates messages before provider call", async () => {
		const fetchMock = vi.fn<FetchLike>();
		vi.stubGlobal("fetch", fetchMock);

		const { chatText } = await import("$lib/server/llm");
		await expect(chatText({ messages: [] as any })).rejects.toThrow("messages must contain at least one item");
		await expect(chatText({ messages: [{ role: "bad" as any, content: "hi" }] })).rejects.toThrow("each message.role must be one of");
		await expect(chatText({ messages: [{ role: "user", content: "   " }] })).rejects.toThrow("each message.content must be a non-empty string");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("uses BYOK config when userId has a configured key", async () => {
		const { db: mockDb } = await import("$lib/server/db");
		const { chatText, encryptApiKey } = await import("$lib/server/llm");
		vi.mocked(mockDb.query.userApiKey.findFirst).mockResolvedValueOnce({
			userId: "byok-user",
			encryptedKey: encryptApiKey("user-key"),
			baseUrl: "https://user-api.example.com/v1/",
			model: "user-model",
		} as any);
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse("ok"));
		vi.stubGlobal("fetch", fetchMock);

		await chatText({ messages: [{ role: "system", content: "hi" }], userId: "byok-user" });

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://user-api.example.com/v1/chat/completions");
		expect(getHeader(init.headers, "authorization")).toBe("Bearer user-key");
		expect(JSON.parse(String(init.body)).model).toBe("user-model");
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("falls back to env config when user has no BYOK row and debits visible output tokens", async () => {
		const { db: mockDb } = await import("$lib/server/db");
		vi.mocked(mockDb.query.userApiKey.findFirst).mockResolvedValueOnce(undefined);
		const fetchMock = vi.fn<FetchLike>(async () =>
			createChatCompletionResponse("ok", {}, { usage: { completion_tokens: 12, completion_tokens_details: { reasoning_tokens: 2 } } }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { chatText } = await import("$lib/server/llm");
		const result = await chatText({ messages: [{ role: "system", content: "hi" }], userId: "env-user" });

		const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://example.com/v1/chat/completions");
		expect(mockDbUpdate).toHaveBeenCalledTimes(1);
		expect(result.quota).toMatchObject({ trialTokensUsed: 10, trialUsageEstimated: false });
	});

	it("estimates non-BYOK output usage from response text when provider usage is missing", async () => {
		const { db: mockDb } = await import("$lib/server/db");
		vi.mocked(mockDb.query.userApiKey.findFirst).mockResolvedValueOnce(undefined);
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchLike>(async () => createChatCompletionResponse("hello world")),
		);

		const { chatText } = await import("$lib/server/llm");
		const result = await chatText({ messages: [{ role: "system", content: "hi" }], userId: "env-user" });

		expect(result.quota).toMatchObject({ trialTokensUsed: 3, trialUsageEstimated: true });
	});

	it("blocks non-BYOK calls before the provider when trial quota is exhausted", async () => {
		const { db: mockDb } = await import("$lib/server/db");
		vi.mocked(mockDb.query.userApiKey.findFirst).mockResolvedValueOnce(undefined);
		mockUserQuotaFindFirst.mockResolvedValueOnce({ trialTokensLeft: 0, trialTokensTotal: 50_000 });
		const fetchMock = vi.fn<FetchLike>();
		vi.stubGlobal("fetch", fetchMock);

		const { chatText } = await import("$lib/server/llm");
		const { TrialQuotaExhaustedError } = await import("$lib/server/trial-quota");
		await expect(chatText({ messages: [{ role: "system", content: "hi" }], userId: "env-user" })).rejects.toBeInstanceOf(TrialQuotaExhaustedError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("throws config and provider errors clearly", async () => {
		const { chatText } = await import("$lib/server/llm");
		vi.stubGlobal("fetch", vi.fn());

		mockEnv.OPENAI_API_KEY = "";
		await expect(chatText({ messages: [{ role: "system", content: "hi" }] })).rejects.toThrow("The shared AI service is not configured");

		mockEnv.OPENAI_API_KEY = "test-key";
		mockEnv.OPENAI_BASE_URL = "";
		await expect(chatText({ messages: [{ role: "system", content: "hi" }] })).rejects.toThrow("The shared AI service is not configured");

		mockEnv.OPENAI_BASE_URL = "https://example.com/v1";
		mockEnv.OPENAI_MODEL = "";
		await expect(chatText({ messages: [{ role: "system", content: "hi" }] })).rejects.toThrow("The shared AI service is not configured");
	});

	it("maps OpenAI-compatible API and network errors", async () => {
		const { chatText, OpenAIAuthError } = await import("$lib/server/llm");

		vi.stubGlobal(
			"fetch",
			vi.fn<FetchLike>(async () => new Response("Unauthorized", { status: 401 })),
		);
		await expect(chatText({ messages: [{ role: "system", content: "hi" }] })).rejects.toBeInstanceOf(OpenAIAuthError);

		vi.stubGlobal(
			"fetch",
			vi.fn<FetchLike>(async () => new Response("Server Error", { status: 500 })),
		);
		await expect(chatText({ messages: [{ role: "system", content: "hi" }] })).rejects.toThrow("The AI provider is temporarily unavailable");

		vi.stubGlobal(
			"fetch",
			vi.fn<FetchLike>(async () => createChatCompletionResponse("")),
		);
		await expect(chatText({ messages: [{ role: "system", content: "hi" }] })).rejects.toThrow("The AI provider returned an empty response");

		vi.stubGlobal(
			"fetch",
			vi.fn<FetchLike>(async () => {
				throw new Error("ECONNREFUSED");
			}),
		);
		await expect(chatText({ messages: [{ role: "system", content: "hi" }] })).rejects.toThrow("Could not connect to the AI provider");
	});

	it("logs request and response bodies only when LLM_DEBUG is enabled", async () => {
		mockEnv.LLM_DEBUG = "true";
		const fetchMock = vi.fn<FetchLike>(async () => createChatCompletionResponse("ok"));
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
		vi.stubGlobal("fetch", fetchMock);

		const { chatText } = await import("$lib/server/llm");
		await chatText({ messages: [{ role: "system", content: "Return text." }] });

		expect(infoSpy).toHaveBeenCalledWith("[llm-debug] request", expect.stringContaining('"url": "https://example.com/v1/chat/completions"'));
		expect(infoSpy).toHaveBeenCalledWith("[llm-debug] response", expect.stringContaining('"status": 200'));
		const loggedText = infoSpy.mock.calls.map((call) => call.join(" ")).join("\n");
		expect(loggedText).not.toContain("test-key");
		expect(loggedText).not.toContain("Authorization");
	});
});

describe("chatJson", () => {
	it("parses fenced JSON objects and arrays", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchLike>(async () => createChatCompletionResponse('```json\n["one", "two"]\n```')),
		);

		const { chatJson } = await import("$lib/server/llm");
		const result = await chatJson({ schema: z.array(z.string()), messages: [{ role: "system", content: "Return JSON." }] });

		expect(result.value).toEqual(["one", "two"]);
		expect(result.content).toContain("one");
		expect(result.finishReason).toBe("stop");
	});

	it("recovers provider output with a newline between opening quote and key name", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchLike>(async () => createChatCompletionResponse('{"\nreply":"¡Hola!","terminate":false}')),
		);

		const { chatJson } = await import("$lib/server/llm");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });

		await expect(chatJson({ schema, messages: [{ role: "system", content: "Return JSON." }] })).resolves.toMatchObject({
			value: { reply: "¡Hola!", terminate: false },
		});
	});

	it("repairs invalid structured output with the raw response and validation errors", async () => {
		const fetchMock = vi
			.fn<FetchLike>()
			.mockResolvedValueOnce(createChatCompletionResponse('{"reply":": "}'))
			.mockResolvedValueOnce(createChatCompletionResponse('{"reply":"Recovered","terminate":false}'));
		vi.stubGlobal("fetch", fetchMock);

		const { chatJson } = await import("$lib/server/llm");
		const schema = z.object({ reply: z.string(), terminate: z.boolean() });
		const result = await chatJson({ schema, messages: [{ role: "system", content: "Return JSON." }] });

		expect(result.value).toEqual({ reply: "Recovered", terminate: false });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const firstPayload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
		const secondPayload = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
		expect(firstPayload.messages).toEqual([{ role: "system", content: "Return JSON." }]);
		expect(secondPayload.messages).toEqual([
			{ role: "system", content: "Return JSON." },
			{ role: "assistant", content: '{"reply":": "}' },
			expect.objectContaining({ role: "user", content: expect.any(String) }),
		]);
		expect(result.requestMessages).toEqual(secondPayload.messages);
	});

	it("rethrows the first structured-output error when retry cannot recover", async () => {
		const fetchMock = vi
			.fn<FetchLike>()
			.mockResolvedValueOnce(createChatCompletionResponse("not json"))
			.mockResolvedValueOnce(createChatCompletionResponse("still not json"));
		vi.stubGlobal("fetch", fetchMock);

		const { chatJson } = await import("$lib/server/llm");
		const failure = await chatJson({ schema: z.object({ reply: z.string() }), messages: [{ role: "system", content: "Return JSON." }] }).catch(
			(error) => error,
		);
		expect(failure.message).toBe("The AI response was not in the expected format. Please try again.");
		expect(failure.details).toMatchObject({
			requestMessages: [{ role: "system", content: "Return JSON." }],
			initialContent: "not json",
			repair: {
				content: "still not json",
				requestMessages: [
					{ role: "system", content: "Return JSON." },
					{ role: "assistant", content: "not json" },
					expect.objectContaining({ role: "user" }),
				],
			},
		});
		expect(failure.details.errors).toEqual([expect.stringContaining("not json"), expect.stringContaining("still not json")]);
	});

	it("preserves the initial response and repair prompt when the repair provider call fails", async () => {
		const fetchMock = vi
			.fn<FetchLike>()
			.mockResolvedValueOnce(createChatCompletionResponse("not json"))
			.mockRejectedValueOnce(new TypeError("repair connection failed"));
		vi.stubGlobal("fetch", fetchMock);

		const { chatJson } = await import("$lib/server/llm");
		const failure = await chatJson({ schema: z.object({ reply: z.string() }), messages: [{ role: "system", content: "Return JSON." }] }).catch(
			(error) => error,
		);

		expect(failure.details).toMatchObject({
			initialContent: "not json",
			repair: {
				content: null,
				raw: null,
				requestMessages: [
					{ role: "system", content: "Return JSON." },
					{ role: "assistant", content: "not json" },
					expect.objectContaining({ role: "user" }),
				],
			},
		});
	});

	it("does not repair a truncated structured completion", async () => {
		const fetchMock = vi.fn<FetchLike>(
			async () =>
				new Response(
					JSON.stringify({
						id: "chatcmpl-truncated",
						model: "test-model",
						choices: [{ finish_reason: "length", message: { role: "assistant", content: '{"reply":"cut' } }],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { chatJson } = await import("$lib/server/llm");
		await expect(chatJson({ schema: z.object({ reply: z.string() }), messages: [{ role: "system", content: "Return JSON." }] })).rejects.toThrow(
			"expected format",
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("trial quota", () => {
	it("preserves and resumes trial quota around BYOK by only debiting env-sourced calls", async () => {
		const { db: mockDb } = await import("$lib/server/db");
		const { chatText, encryptApiKey } = await import("$lib/server/llm");
		vi.mocked(mockDb.query.userApiKey.findFirst)
			.mockResolvedValueOnce({
				userId: "user-1",
				encryptedKey: encryptApiKey("user-key"),
				baseUrl: "https://user-api.example.com/v1",
				model: "user-model",
			} as any)
			.mockResolvedValueOnce(undefined);
		mockUserQuotaFindFirst.mockResolvedValue({ trialTokensLeft: 123, trialTokensTotal: 50_000 });
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchLike>(async () => createChatCompletionResponse("ok")),
		);

		await chatText({ messages: [{ role: "system", content: "hi" }], userId: "user-1" });
		expect(mockDbUpdate).not.toHaveBeenCalled();

		await chatText({ messages: [{ role: "system", content: "hi" }], userId: "user-1" });
		expect(mockDbUpdate).toHaveBeenCalledTimes(1);
	});
});
describe("chatTools", () => {
	it("sends function tools and returns parsed tool calls", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createToolCallResponse("Goodbye!"));
		vi.stubGlobal("fetch", fetchMock);

		const { chatTools } = await import("$lib/server/llm");
		const result = await chatTools({
			messages: [{ role: "system", content: "Reply plainly." }],
			tools: [
				{
					type: "function",
					function: {
						name: "terminate_conversation",
						description: "End the chat.",
						parameters: { type: "object", properties: {} },
					},
				},
			],
		});

		expect(result.content).toBe("Goodbye!");
		expect(result.toolCalls).toEqual([expect.objectContaining({ id: "call-1", name: "terminate_conversation", arguments: { reason: "goodbye" } })]);
		const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
		expect(payload.tool_choice).toBe("auto");
		expect(payload.parallel_tool_calls).toBe(false);
		expect(payload.tools[0].function.name).toBe("terminate_conversation");
	});

	it("allows empty assistant content when a tool call is returned", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchLike>(async () => createToolCallResponse(null)),
		);

		const { chatTools } = await import("$lib/server/llm");
		const result = await chatTools({
			messages: [{ role: "system", content: "Reply plainly." }],
			tools: [{ type: "function", function: { name: "terminate_conversation", parameters: { type: "object", properties: {} } } }],
		});

		expect(result.content).toBe("");
		expect(result.toolCalls[0]?.name).toBe("terminate_conversation");
	});

	it("rejects empty tool lists", async () => {
		const { chatTools } = await import("$lib/server/llm");
		await expect(chatTools({ messages: [{ role: "system", content: "hi" }], tools: [] })).rejects.toThrow("tools must contain at least one item");
	});
});
