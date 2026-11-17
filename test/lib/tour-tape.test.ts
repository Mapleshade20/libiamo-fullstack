import assert from "node:assert/strict";
import { test } from "vitest";
import { playTape, stopTape, type Tape } from "#lib/components/tour/tape.ts";

// The tour's tape stands in for every model call: a browser-like global with a fetch that must never be reached for them.
const reached: string[] = [];
const g = globalThis as unknown as { window: { fetch: typeof fetch }; location: { origin: string } };
g.location = { origin: "http://localhost" };
g.window = {
	fetch: (async (input: RequestInfo | URL) => {
		reached.push(String(input));
		return new Response("real");
	}) as typeof fetch,
};

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

test("accidental remote queries and writes fail closed; replaying a chapter resets consumed responses", async () => {
	const before = reached.length;
	playTape(tape, { pace: 0 });
	await assert.rejects(g.window.fetch("/_app/remote/hash/scenarioView?arg=x"), /live application data/);
	await assert.rejects(post("/_app/remote/hash/sendSheet", "{}"), /live application data/);
	assert.equal(reached.length, before);
	assert.equal((await post("/api/gate")).status, 200);
	playTape(tape, { pace: 0 });
	assert.equal((await post("/api/gate")).status, 200);
	stopTape();
});

test("a delayed response from a previous playback cannot enter the next chapter", async () => {
	playTape([{ ...tape[2], ms: 30 }], { pace: 1 });
	const late = post("/api/gate");
	const rejected = assert.rejects(late, { name: "AbortError" });
	playTape(tape, { pace: 0 });
	await rejected;
	assert.equal((await post("/api/gate")).status, 200);
	stopTape();
});
