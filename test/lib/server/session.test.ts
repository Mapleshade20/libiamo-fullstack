import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {
		OPENAI_BASE_URL: "https://unit.example/v4",
		OPENAI_API_KEY: "unit-key",
		OPENAI_MODEL: "glm-5",
	},
}));

vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

vi.mock("$lib/server/db", () => ({
	db: {
		query: { userApiKey: { findFirst: vi.fn().mockResolvedValue(null) } },
	},
}));

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function createJsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("chat facade request shape", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mockEnv.OPENAI_BASE_URL = "https://unit.example/v4";
		mockEnv.OPENAI_API_KEY = "unit-key";
		mockEnv.OPENAI_MODEL = "glm-5";
	});

	it("chatText sends caller-provided multi-turn history unchanged", async () => {
		const fetchMock = vi.fn<FetchLike>(async () =>
			createJsonResponse({
				id: "multi-1",
				model: "glm-5",
				choices: [{ message: { content: "I am doing well." } }],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { chatText } = await import("$lib/server/llm");
		const result = await chatText({
			messages: [
				{ role: "system", content: "You are helpful." },
				{ role: "user", content: "Hi" },
				{ role: "assistant", content: "Hello!" },
				{ role: "user", content: "How are you?" },
			],
		});

		expect(result.content).toBe("I am doing well.");
		const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
		expect(payload.messages).toEqual([
			{ role: "system", content: "You are helpful." },
			{ role: "user", content: "Hi" },
			{ role: "assistant", content: "Hello!" },
			{ role: "user", content: "How are you?" },
		]);
	});

	it("chatText preserves adjacent user turns", async () => {
		const fetchMock = vi.fn<FetchLike>(async () => createJsonResponse({ model: "glm-5", choices: [{ message: { content: "ok" } }] }));
		vi.stubGlobal("fetch", fetchMock);

		const { chatText } = await import("$lib/server/llm");
		await chatText({
			messages: [
				{ role: "system", content: "New persona" },
				{ role: "user", content: "Hi" },
				{ role: "user", content: "How are you?" },
			],
		});

		const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
		expect(payload.messages).toEqual([
			{ role: "system", content: "New persona" },
			{ role: "user", content: "Hi" },
			{ role: "user", content: "How are you?" },
		]);
	});
});
