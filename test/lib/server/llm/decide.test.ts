import assert from "node:assert/strict";
import { test } from "vitest";
import { openAiAnswers, openAiBody, readChatAnswers } from "#lib/server/llm/decide.ts";

const questions = {
	language: { instructions: "", choices: { en: "English", "zh-CN": "Chinese", other: "Another language" } },
	usable: { instructions: "", choices: { ok: "Real writing", too_short: "Too short" } },
};

test("a chat model's answers are read from JSON, its confidence spread over the options", () => {
	const a = readChatAnswers('{"language": {"choice": "en", "confidence": 0.8}, "usable": {"choice": "ok", "confidence": 0.9}}', questions);
	assert.equal(a.language.choice, "en");
	assert.equal(a.language.probabilities.en, 0.8);
	assert.ok(Math.abs(a.language.probabilities.other - 0.1) < 1e-9);
	assert.equal(a.usable.probabilities.ok, 0.9);
});

test("replies that are not quite as asked are still read, and what cannot be read is left out", () => {
	// Fenced, bare values, an option named by its description, a confidence as a percentage or a word.
	const a = readChatAnswers('Sure!\n```json\n{"Language": "Chinese", "usable": {"answer": "too short", "confidence": "high"}}\n```', questions);
	assert.equal(a.language.choice, "zh-CN");
	assert.equal(a.usable.choice, "too_short");
	assert.equal(a.usable.probabilities.too_short, 0.9);
	assert.equal(readChatAnswers('{"language": {"choice": "en", "confidence": 85}}', questions).language.probabilities.en, 0.85);
	// Not JSON at all: the fields one by one.
	assert.equal(readChatAnswers('language: "en", usable: {"choice": "ok"', questions).usable.choice, "ok");
	// An option that is not listed, or no reply worth the name.
	assert.deepEqual(Object.keys(readChatAnswers('{"language": "Swedish", "usable": "ok"}', questions)), ["usable"]);
	assert.deepEqual(readChatAnswers("I cannot help with that.", questions), {});
});

test("a list of answers is read too", () => {
	const a = readChatAnswers(
		'[{"name": "language", "choice": "other"}, {"name": "usable", "choice": "ok", "probabilities": {"ok": 0.7, "too_short": 0.3}}]',
		questions,
	);
	assert.equal(a.language.choice, "other");
	assert.deepEqual(a.usable.probabilities, { ok: 0.7, too_short: 0.3 });
});

test("OpenAI's Decisions API is asked and read in its own shape", () => {
	const body = openAiBody("gpt-6-luna", { text: "hi" }, { usable: questions.usable });
	assert.deepEqual(body.questions, [
		{
			type: "choice",
			name: "usable",
			instructions: "",
			choices: [
				{ value: "ok", description: "Real writing" },
				{ value: "too_short", description: "Too short" },
			],
		},
	]);
	assert.equal(typeof body.input, "string");
	const a = openAiAnswers({
		answers: [
			{
				type: "choice",
				name: "usable",
				choice: "ok",
				probabilities: [
					{ value: "ok", probability: 0.95 },
					{ value: "too_short", probability: 0.05 },
				],
				confidence: 0.93,
			},
			{ type: "refusal", name: "language" },
		],
	});
	assert.deepEqual(a, { usable: { choice: "ok", probabilities: { ok: 0.95, too_short: 0.05 } } });
});
