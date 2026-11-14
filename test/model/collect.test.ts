import assert from "node:assert/strict";
import { test } from "vitest";
import { matchExplained } from "#model/collect.ts";
import { type Choice, judge, precheck } from "#model/gate.ts";

const item = (n: number, phrase: string) => ({ n, phrase, meaning: "", register: "neutral" as const, why: "", example: "" });

test("answers come back under the page's own highlight numbers", () => {
	// The page's third highlight is the only one asked; the prompt numbers it 1.
	assert.deepEqual(
		matchExplained([{ n: 3, text: "come to his rescue" }], [item(1, "come to someone's rescue")]).map((x) => [x.n, x.phrase]),
		[[3, "come to someone's rescue"]],
	);
});

test("answers numbered off are matched by order when the counts agree, and dropped when they do not", () => {
	const given = [
		{ n: 5, text: "a" },
		{ n: 9, text: "b" },
	];
	assert.deepEqual(
		matchExplained(given, [item(7, "A"), item(8, "B")]).map((x) => [x.n, x.phrase]),
		[
			[5, "A"],
			[9, "B"],
		],
	);
	assert.deepEqual(matchExplained(given, [item(7, "A")]), []);
});

const reasonOf = (text: string, mode: "check" | "collect") => {
	const g = precheck(text, mode);
	return g && "reason" in g ? g.reason : g;
};
test("the gate settles plain cases in code, before any model", () => {
	assert.equal(reasonOf("   ", "check"), "empty");
	assert.equal(reasonOf(";;;;!!!", "check"), "symbols");
	assert.equal(reasonOf("https://archiveofourown.org/works/1", "check"), "link");
	assert.equal(reasonOf("hi there", "check"), "tooShort");
	// A phrase on its own is fine to collect.
	assert.equal(precheck("a slow burn", "collect"), null);
	assert.equal(precheck("I really loved how this chapter ended.", "check"), null);
});

const said = (language: string, extra: Record<string, number> = {}): Record<string, Choice> => ({
	language: { choice: language, probabilities: { [language]: 1 } },
	usable: { choice: "ok", probabilities: { ok: 0.9, heavy_mix: 0, ...extra } },
});
test("the gate refuses a language the app does not work in, and offers one it does", () => {
	const input = { mode: "check" as const, text: "", native: "zh-CN", learning: ["en"], active: "en" };
	// Hebrew is "other" to the model: refused, not left to the learner to send anyway.
	assert.deepEqual(judge(input, said("other")), { verdict: "reject", reason: "unsupported" });
	assert.deepEqual(judge(input, said("other", { heavy_mix: 0.7 })), { verdict: "reject", reason: "mixed" });
	assert.deepEqual(judge(input, said("ko")), { verdict: "ask", reason: "addLang", lang: "ko" });
	assert.deepEqual(judge(input, said("zh-CN")), { verdict: "ask", reason: "native", lang: "en" });
});
