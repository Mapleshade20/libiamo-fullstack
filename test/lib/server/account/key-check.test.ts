import { afterEach, assert, test, vi } from "vitest";
import { checkKey } from "#lib/server/account/key-check.ts";

/* A key is tried with one single-token request before it is saved; each way it can fail says why. */
const answer = (status: number, body: unknown = {}) =>
	vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
afterEach(() => vi.restoreAllMocks());

test("asks the provider for one token, on the key and model given", async () => {
	const f = answer(200, { choices: [{ message: { content: "H" } }] });
	assert.deepEqual(await checkKey("openrouter", "~anthropic/claude-haiku-latest", "sk-or-test"), { ok: true });
	const [url, init] = f.mock.calls[0] as [string, RequestInit];
	assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
	assert.equal((init.headers as Record<string, string>).authorization, "Bearer sk-or-test");
	const body = JSON.parse(String(init.body));
	assert.equal(body.max_tokens, 1);
	assert.equal(body.model, "~anthropic/claude-haiku-latest");
});

test("a key held back for a moment works", async () => {
	answer(429, { error: { message: "Rate limit exceeded" } });
	assert.deepEqual(await checkKey("openai", "gpt-6-luna", "sk-test"), { ok: true });
});

test("each refusal is named", async () => {
	answer(401, { error: { message: "No auth credentials found" } });
	assert.deepEqual(await checkKey("openrouter", "m", "sk-bad"), { ok: false, problem: "setKeyRefused" });
	vi.restoreAllMocks();
	answer(402, { error: { message: "Insufficient credits" } });
	assert.deepEqual(await checkKey("openrouter", "m", "sk-poor"), { ok: false, problem: "setKeyCredit" });
	vi.restoreAllMocks();
	answer(400, { error: { message: "nope/nothing is not a valid model ID" } });
	assert.deepEqual(await checkKey("openrouter", "nope/nothing", "sk"), { ok: false, problem: "setKeyModel" });
	vi.restoreAllMocks();
	answer(400, { error: { message: "Model Not Exist" } });
	assert.deepEqual(await checkKey("deepseek", "deepseek-nothing", "sk"), { ok: false, problem: "setKeyModel" });
	vi.restoreAllMocks();
	answer(404, { error: { message: "The model `gpt-0` does not exist" } });
	assert.deepEqual(await checkKey("openai", "gpt-0", "sk"), { ok: false, problem: "setKeyModel" });
});

test("anything else carries the provider's own words", async () => {
	answer(400, { error: { message: "max_tokens is too small for this request" } });
	assert.deepEqual(await checkKey("glm", "glm-x", "sk"), { ok: false, problem: "setKeyOther", detail: "max_tokens is too small for this request" });
});

test("no answer, or a provider failing, is a matter of trying again", async () => {
	vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("timed out", "TimeoutError"));
	assert.deepEqual(await checkKey("openrouter", "m", "sk"), { ok: false, problem: "setKeyUnreachable" });
	vi.restoreAllMocks();
	answer(503, { error: { message: "Service unavailable" } });
	assert.deepEqual(await checkKey("openrouter", "m", "sk"), { ok: false, problem: "setKeyUnreachable" });
});
