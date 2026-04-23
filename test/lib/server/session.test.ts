import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {
		OPENAI_BASE_URL: "https://unit.example/v4",
		OPENAI_API_KEY: "unit-key",
		OPENAI_MODEL: "glm-5",
	},
}));

vi.mock("$env/dynamic/private", () => ({
	env: mockEnv,
}));

import { createMultiTurnChat, createSingleTurnChat } from "$lib/server/client";

function createJsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("chat client wrappers", () => {
	type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

	beforeEach(() => {
		vi.restoreAllMocks();
		mockEnv.OPENAI_BASE_URL = "https://unit.example/v4";
		mockEnv.OPENAI_API_KEY = "unit-key";
		mockEnv.OPENAI_MODEL = "glm-5";
	});

	describe("single turn wrapper", () => {
		it("sends request and returns trimmed content", async () => {
			const fetchMock = vi.fn<FetchLike>(async () =>
				createJsonResponse({
					id: "resp-1",
					model: "glm-5",
					choices: [{ message: { content: "  hello world  " } }],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const result = await createSingleTurnChat({
				systemPrompt: "You are a tutor.",
				userMessage: "Hi",
			});

			expect(result.reply.content).toBe("hello world");
			expect(result.reply).toEqual(
				expect.objectContaining({
					content: "hello world",
				}),
			);

			expect(fetchMock).toHaveBeenCalledTimes(1);
			const firstCall = fetchMock.mock.calls[0];
			if (!firstCall) throw new Error("fetch was not called");
			const url = firstCall[0] as string;
			const init = (firstCall[1] ?? {}) as RequestInit;
			expect(url).toContain("chat/completions");
			expect(init.method).toBe("POST");
			// AI SDK sets authorization header (case may vary)
			const headers = init.headers as Record<string, string>;
			expect(headers.authorization ?? headers.Authorization).toContain("Bearer unit-key");
			const payload = JSON.parse(String(init.body));
			expect(payload.model).toBe("glm-5");
			expect(payload.messages).toEqual([
				{ role: "system", content: "You are a tutor." },
				{ role: "user", content: "Hi" },
			]);
		});

		it("uses env values and sends to correct endpoint", async () => {
			const fetchMock = vi.fn<FetchLike>(async () =>
				createJsonResponse({
					model: "glm-5",
					choices: [{ message: { content: "ok" } }],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);
			mockEnv.OPENAI_BASE_URL = "https://custom.example/v4/";

			await createSingleTurnChat({
				systemPrompt: "You are a tutor.",
				userMessage: "Hi",
				options: {
					temperature: 0.2,
					maxTokens: 128,
				},
			});

			const firstCall = fetchMock.mock.calls[0];
			if (!firstCall) throw new Error("fetch was not called");
			const url = firstCall[0] as string;
			expect(url).toContain("custom.example");
			expect(url).toContain("chat/completions");
		});

		it("throws when api key is missing", async () => {
			mockEnv.OPENAI_API_KEY = "";
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createSingleTurnChat({
					systemPrompt: "You are a tutor.",
					userMessage: "Hi",
				}),
			).rejects.toThrow("OPENAI_API_KEY is not set. Please set OPENAI_API_KEY in .env");
		});

		it("throws when base url is missing", async () => {
			mockEnv.OPENAI_BASE_URL = "";
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createSingleTurnChat({
					systemPrompt: "You are a tutor.",
					userMessage: "Hi",
				}),
			).rejects.toThrow("OPENAI_BASE_URL is not set. Please set OPENAI_BASE_URL in .env");
		});

		it("throws when model is missing", async () => {
			mockEnv.OPENAI_MODEL = "";
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createSingleTurnChat({
					systemPrompt: "You are a tutor.",
					userMessage: "Hi",
				}),
			).rejects.toThrow("OPENAI_MODEL is not set. Please set OPENAI_MODEL in .env");
		});

		it("throws when response has malformed JSON", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(
					async () =>
						new Response("not json at all", {
							status: 200,
							headers: { "Content-Type": "application/json" },
						}),
				),
			);

			await expect(
				createSingleTurnChat({
					systemPrompt: "You are a tutor.",
					userMessage: "Hi",
				}),
			).rejects.toThrow();
		});

		it("throws when content is empty", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					createJsonResponse({
						choices: [{ message: { content: "   " } }],
					}),
				),
			);

			await expect(
				createSingleTurnChat({
					systemPrompt: "You are a tutor.",
					userMessage: "Hi",
				}),
			).rejects.toThrow("LLM returned empty content");
		});

		it("throws when systemPrompt is empty", async () => {
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createSingleTurnChat({
					systemPrompt: "   ",
					userMessage: "Hi",
				}),
			).rejects.toThrow("systemPrompt is required");
		});

		it("throws when userMessage is empty", async () => {
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createSingleTurnChat({
					systemPrompt: "You are a tutor.",
					userMessage: "   ",
				}),
			).rejects.toThrow("userMessage is required");
		});

		it("throws when single-turn userMessage content is non-string", async () => {
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createSingleTurnChat({
					systemPrompt: "You are a tutor.",
					userMessage: 123 as unknown as string,
				}),
			).rejects.toThrow("userMessage is required");
		});

		it("trims systemPrompt and userMessage before sending", async () => {
			const fetchMock = vi.fn<FetchLike>(async () =>
				createJsonResponse({
					model: "glm-5",
					choices: [{ message: { content: "ok" } }],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			await createSingleTurnChat({
				systemPrompt: "  You are a tutor.  ",
				userMessage: "  Hi there  ",
			});

			const firstCall = fetchMock.mock.calls[0];
			if (!firstCall) throw new Error("fetch was not called");
			const init = (firstCall[1] ?? {}) as RequestInit;
			const payload = JSON.parse(String(init.body));
			expect(payload.messages).toEqual([
				{ role: "system", content: "You are a tutor." },
				{ role: "user", content: "Hi there" },
			]);
		});
	});

	describe("conversation wrappers", () => {
		it("createSingleTurnChat builds system+user request and appends assistant reply", async () => {
			const fetchMock = vi.fn<FetchLike>(async () =>
				createJsonResponse({
					id: "single-1",
					model: "qwen3-max",
					choices: [{ message: { content: "Sure, let's start." } }],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const result = await createSingleTurnChat({
				systemPrompt: "You are a tutor.",
				userMessage: "Hello",
			});

			expect(result.reply.content).toBe("Sure, let's start.");
			expect(result.messages).toEqual([
				{ role: "system", content: "You are a tutor." },
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Sure, let's start." },
			]);

			const firstCall = fetchMock.mock.calls[0];
			if (!firstCall) throw new Error("fetch was not called");
			const init = (firstCall[1] ?? {}) as RequestInit;
			const payload = JSON.parse(String(init.body));
			expect(payload.messages).toEqual([
				{ role: "system", content: "You are a tutor." },
				{ role: "user", content: "Hello" },
			]);
		});

		it("createMultiTurnChat appends user+assistant and preserves history", async () => {
			const fetchMock = vi.fn<FetchLike>(async () =>
				createJsonResponse({
					id: "multi-1",
					model: "qwen3-max",
					choices: [{ message: { content: "I am doing well." } }],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const result = await createMultiTurnChat({
				history: [
					{ role: "system", content: "You are helpful." },
					{ role: "user", content: "Hi" },
					{ role: "assistant", content: "Hello!" },
				],
				userMessage: "How are you?",
			});

			expect(result.reply.content).toBe("I am doing well.");
			expect(result.messages).toEqual([
				{ role: "system", content: "You are helpful." },
				{ role: "user", content: "Hi" },
				{ role: "assistant", content: "Hello!" },
				{ role: "user", content: "How are you?" },
				{ role: "assistant", content: "I am doing well." },
			]);

			const firstCall = fetchMock.mock.calls[0];
			if (!firstCall) throw new Error("fetch was not called");
			const init = (firstCall[1] ?? {}) as RequestInit;
			const payload = JSON.parse(String(init.body));
			expect(payload.messages).toEqual([
				{ role: "system", content: "You are helpful." },
				{ role: "user", content: "Hi" },
				{ role: "assistant", content: "Hello!" },
				{ role: "user", content: "How are you?" },
			]);
		});

		it("replaces existing system in history when input.systemPrompt is provided", async () => {
			const fetchMock = vi.fn<FetchLike>(async () =>
				createJsonResponse({
					id: "multi-2",
					model: "qwen3-max",
					choices: [{ message: { content: "new style applied" } }],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const result = await createMultiTurnChat({
				history: [
					{ role: "user", content: "Hi" },
					{ role: "system", content: "Old persona" },
					{ role: "assistant", content: "Hello!" },
				],
				systemPrompt: "New persona",
				userMessage: "How are you?",
			});

			expect(result.reply.content).toBe("new style applied");
			const firstCall = fetchMock.mock.calls[0];
			if (!firstCall) throw new Error("fetch was not called");
			const init = (firstCall[1] ?? {}) as RequestInit;
			const payload = JSON.parse(String(init.body));
			expect(payload.messages).toEqual([
				{ role: "user", content: "Hi" },
				{ role: "system", content: "New persona" },
				{ role: "assistant", content: "Hello!" },
				{ role: "user", content: "How are you?" },
			]);
		});

		it("throws when neither input.systemPrompt nor history has system message", async () => {
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createMultiTurnChat({
					history: [{ role: "user", content: "Hi" }],
					userMessage: "How are you?",
				}),
			).rejects.toThrow("systemPrompt is required for the first turn, or history must include a system message");
		});

		it("throws when history is not an array", async () => {
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createMultiTurnChat({
					history: null as unknown as Array<{ role: "system" | "user" | "assistant"; content: string }>,
					userMessage: "How are you?",
				}),
			).rejects.toThrow("history must be an array");
		});

		it("throws when multi-turn userMessage is empty", async () => {
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createMultiTurnChat({
					history: [{ role: "system", content: "You are helpful." }],
					userMessage: "   ",
				}),
			).rejects.toThrow("userMessage is required");
		});

		it("inserts systemPrompt to the front when history has no system", async () => {
			const fetchMock = vi.fn<FetchLike>(async () =>
				createJsonResponse({
					model: "qwen3-max",
					choices: [{ message: { content: "ok" } }],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			await createMultiTurnChat({
				history: [{ role: "user", content: "Hi" }],
				systemPrompt: "New persona",
				userMessage: "How are you?",
			});

			const firstCall = fetchMock.mock.calls[0];
			if (!firstCall) throw new Error("fetch was not called");
			const init = (firstCall[1] ?? {}) as RequestInit;
			const payload = JSON.parse(String(init.body));
			expect(payload.messages).toEqual([
				{ role: "system", content: "New persona" },
				{ role: "user", content: "Hi" },
				{ role: "user", content: "How are you?" },
			]);
		});

		it("works when system exists in non-first history position and input.systemPrompt is omitted", async () => {
			const fetchMock = vi.fn<FetchLike>(async () =>
				createJsonResponse({
					model: "qwen3-max",
					choices: [{ message: { content: "ok" } }],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			await createMultiTurnChat({
				history: [
					{ role: "user", content: "Hi" },
					{ role: "system", content: "Existing persona" },
					{ role: "assistant", content: "Hello!" },
				],
				userMessage: "How are you?",
			});

			const firstCall = fetchMock.mock.calls[0];
			if (!firstCall) throw new Error("fetch was not called");
			const init = (firstCall[1] ?? {}) as RequestInit;
			const payload = JSON.parse(String(init.body));
			expect(payload.messages).toEqual([
				{ role: "user", content: "Hi" },
				{ role: "system", content: "Existing persona" },
				{ role: "assistant", content: "Hello!" },
				{ role: "user", content: "How are you?" },
			]);
		});

		it("throws when history contains invalid role", async () => {
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createMultiTurnChat({
					history: [
						{ role: "system", content: "persona" },
						{ role: "tool" as unknown as "system", content: "bad role" },
					],
					userMessage: "How are you?",
				}),
			).rejects.toThrow("each message.role must be one of: system, user, assistant");
		});

		it("throws when history contains blank content after trim", async () => {
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createMultiTurnChat({
					history: [
						{ role: "system", content: "persona" },
						{ role: "assistant", content: "   " },
					],
					userMessage: "How are you?",
				}),
			).rejects.toThrow("each message.content must be a non-empty string");
		});

		it("throws when history contains non-string content", async () => {
			vi.stubGlobal("fetch", vi.fn());

			await expect(
				createMultiTurnChat({
					history: [
						{ role: "system", content: "persona" },
						{ role: "assistant", content: { bad: true } as unknown as string },
					],
					userMessage: "How are you?",
				}),
			).rejects.toThrow("each message.content must be a non-empty string");
		});
	});
});
