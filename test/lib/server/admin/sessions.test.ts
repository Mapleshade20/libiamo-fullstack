import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("$app/env/private", () => ({}));
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
const { readCollectCall, readStep, signalsOf } = await import("#lib/server/admin/sessions.ts");

const step = (action: string, body: unknown = {}, response: unknown = {}, ms = 500) => ({ action, body, response, ms });

test("a step reads as the learner saw it", () => {
	assert.deepEqual(readStep(step("question", { id: "s2", q: "why?" }, { answer: "because" })), {
		label: "Stop s2 · question",
		lines: [
			{ who: "me", text: "why?" },
			{ who: "tutor", text: "because" },
		],
	});
	assert.equal(readStep(step("apply", { id: "s1", final: "x", self: false })).label, "Stop s1 · took the tutor's");
	assert.equal(readStep(step("pass1", {}, { doc: [["a ", { item: "p1", parts: ["b"] }, { item: "d1", parts: ["c"] }]] })).lines[0].text, "2 marks");
	// A stop opens on its material: the reader's reaction, the tutor's ask and the version held up.
	const opened = readStep(step("material", { id: "s3" }, { reader: "Huh?", prompt: "Say it plainly.", ref: "I [went] home.", construct: "past" }));
	assert.deepEqual(
		opened.lines.map((l) => l.who),
		["reader", "tutor", "card"],
	);
	assert.match(opened.lines[2].text, /^I went home\.\npast$/);
	assert.equal(readStep(step("material", { id: "s3", meanings: ["left"] }, { prompt: "p" })).lines[0].who, "me");
});

test("signals come from the tape and the calls, with no model", () => {
	const tape = [
		step("keep", { id: "s1" }),
		step("grade", { id: "s2", attempt: "a" }, { pass: false }),
		step("grade", { id: "s2", attempt: "b" }, { pass: false }),
		step("grade", { id: "s2", attempt: "c" }, { pass: false }, 9500),
		step("apply", { id: "s2", final: "d", self: false }),
	];
	const kinds = signalsOf(tape, { finished: false, lastAt: 0, now: 2 * 3_600_000, failedCalls: 2, cost: 0.4, medianCost: 0.1 });
	assert.deepEqual(kinds, [
		{ kind: "kept" },
		{ kind: "tries", n: 3 },
		{ kind: "answer" },
		{ kind: "left" },
		{ kind: "failed", n: 2 },
		{ kind: "slow", n: 10 },
		{ kind: "cost" },
	]);
	assert.deepEqual(signalsOf([step("end", {}, { issues: [] })], { finished: true, lastAt: 0, now: 1, failedCalls: 0, cost: 0, medianCost: 0 }), []);
});

test("a collecting call reads as what was highlighted or asked, and what came back", () => {
	const explain = readCollectCall({
		tag: "collect/explain",
		messages: [{ role: "user", content: 'A learner of English…\n\nHighlights:\n1. "a far cry"\n2. "to boot"\n\nFor each highlight, in order:' }],
		output: '```json\n{"items":[{"n":1,"phrase":"a far cry from something","meaning":"远不如","why":"w","example":"e"}]}\n```',
		error: null,
	});
	assert.deepEqual(explain, {
		label: "Highlighted 2",
		lines: [
			{ who: "me", text: "a far cry · to boot" },
			{ who: "tutor", text: "a far cry from something: 远不如\n\nw\n\ne" },
		],
	});
	// A question: the last thing the learner asked, and the answer; a failure is said.
	const ask = readCollectCall({
		tag: "collect/ask",
		messages: [
			{ role: "user", content: "first?" },
			{ role: "assistant", content: "yes" },
			{ role: "user", content: "and formal?" },
		],
		output: null,
		error: "timeout",
	});
	assert.deepEqual(ask.lines, [
		{ who: "me", text: "and formal?" },
		{ who: "card", text: "Failed: timeout" },
	]);
	// Words not kept (the learner did not help improve Libiamo then).
	assert.equal(readCollectCall({ tag: "collect/ask", messages: null, output: null, error: null }).lines[0].who, "card");
});
