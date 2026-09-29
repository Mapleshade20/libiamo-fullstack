import { describe, expect, it, vi } from "vitest";
import { askJevChoice } from "$lib/server/practice/addressee/jev";

const question = { instructions: "Who?", criteria: { p0: "Rin", nobody: "Nobody" } };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("Jev decisions client", () => {
	it("asks one typed Choice with the user's key and returns the answer", async () => {
		const fetch = reply(200, { answers: { question: { type: "choice", choice: "p0", probabilities: { p0: 0.8, nobody: 0.2 } } } });
		const answer = await askJevChoice({ apiKey: "sk-or-x", model: "~typesafe/jev-latest", state: { a: 1 }, question, fetch });
		expect(answer).toEqual({ choice: "p0", probabilities: { p0: 0.8, nobody: 0.2 } });
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-x");
		expect(JSON.parse(init.body as string)).toEqual({
			model: "~typesafe/jev-latest",
			state: { a: 1 },
			questions: { question: { type: "choice", ...question } },
		});
	});

	it("turns every failure into null", async () => {
		const ask = (fetch: typeof globalThis.fetch) => askJevChoice({ apiKey: "k", model: "m", state: {}, question, fetch });
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await ask(reply(503, { error: "down" }))).toBeNull();
		expect(await ask(reply(200, { answers: {} }))).toBeNull();
		expect(await ask(reply(200, { answers: { question: { choice: "p9" } } }))).toBeNull();
		expect(await ask(vi.fn(async () => Promise.reject(new Error("offline"))))).toBeNull();
	});
});
