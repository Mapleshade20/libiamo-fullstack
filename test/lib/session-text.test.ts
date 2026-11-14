import assert from "node:assert/strict";
import { test } from "vitest";
import { esc, fitText, liveFit, wordGap } from "#lib/session/text.ts";

test("text helpers escape what they are given", () => {
	assert.equal(esc('"<&>'), "&quot;&lt;&amp;&gt;");
});

test("a sentence is placed into the post as its kind asks, and live text waits for its full stop", () => {
	assert.equal(fitText("sentence", "it was scary"), "It was scary.");
	assert.equal(fitText("comma", "which scared me."), ", which scared me");
	assert.equal(fitText("raw", "  got  me "), "got me");
	assert.equal(liveFit("sentence", "it was scary"), "It was scary");
	assert.equal(liveFit("sentence", "it was scary!"), "It was scary!");
	assert.equal(liveFit("raw", "   "), "");
});

test("new words stand a space apart except in Chinese and Japanese", () => {
	assert.equal(wordGap("word", "en"), true);
	assert.equal(wordGap(",", "en"), false);
	assert.equal(wordGap("词", "zh-CN"), false);
});
