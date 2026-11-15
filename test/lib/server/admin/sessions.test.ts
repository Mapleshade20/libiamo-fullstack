import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("$app/env/private", () => ({}));
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
const { readStep, signalsOf } = await import("#lib/server/admin/sessions.ts");

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
