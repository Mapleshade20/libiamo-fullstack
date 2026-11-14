import assert from "node:assert/strict";
import { test } from "vitest";
import { playTape, stopTape, type Tape } from "#lib/components/tour/tape.ts";

// The tour's tape stands in for every model call: a browser-like global with a fetch that must never be reached for them.
const reached: string[] = [];
const g = globalThis as unknown as { window: { fetch: typeof fetch }; location: { origin: string } };
g.location = { origin: "http://localhost" };
g.window = { fetch: (async (input: RequestInfo | URL) => (reached.push(String(input)), new Response("real"))) as typeof fetch };

const tape: Tape = [
	{ key: "/api/s/*/material", body: '{"id":"s2"}', status: 200, reply: '{"n":2}', ms: 0 },
	{ key: "/api/s/*/material", body: '{"id":"s1"}', status: 200, reply: '{"n":1}', ms: 0 },
	{ key: "/api/gate", body: "", status: 200, reply: '{"verdict":"ok"}', ms: 0 },
];
const post = (url: string, body = "") => g.window.fetch(url, { method: "POST", body });

test("a request is answered from the tape by its path (the session's id stripped) and body, each answer once", async () => {
	playTape(tape, { pace: 0 });
	assert.deepEqual(await (await post("/api/s/abc123/material", '{"id":"s1"}')).json(), { n: 1 });
	// Asked again with that body gone: the next answer recorded for the path.
	assert.deepEqual(await (await post("/api/s/zzz/material", '{"id":"s1"}')).json(), { n: 2 });
	assert.deepEqual(await (await post("/api/gate", '{"text":"anything"}')).json(), { verdict: "ok" });
	stopTape();
	assert.deepEqual(reached, []);
});

test("nothing off the tape reaches the network; what is not a model call goes through", async () => {
	playTape(tape, { pace: 0 });
	const r = await post("/api/collect/explain", "{}");
	assert.equal(r.status, 503);
	assert.equal(await (await g.window.fetch("/api/i18n/en")).text(), "real");
	stopTape();
	assert.deepEqual(reached, ["/api/i18n/en"]);
});
