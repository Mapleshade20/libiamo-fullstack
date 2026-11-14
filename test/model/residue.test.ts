import assert from "node:assert/strict";
import { test } from "vitest";
import { repeats, residue } from "$model/residue.ts";

const zh = { learner: "zh-CN", target: "en" };
const es = { learner: "en", target: "es" };

test("a word left in the writer's script is residue", () => {
	assert.equal(residue("and it left him both hurt and 愤怒.", zh), "愤怒");
	assert.equal(residue("and it left him both hurt and angry.", zh), null);
});

test("Japanese may keep kanji, an English writer of Japanese is not checked by script", () => {
	assert.equal(residue("彼は怒っていた。", { learner: "zh-CN", target: "ja" }), null);
	assert.equal(residue("Kirito は強い", { learner: "en", target: "ja" }), null);
});

test("an a/b choice left as written is residue; one of its options is not", () => {
	const left = ["hard/not worth it"];
	assert.equal(residue("it would be hard/not worth it to come back", zh, left), "hard/not worth it");
	assert.equal(residue("it would not be worth it to come back", zh, left), null);
});

test("in a shared script, a run of a left passage's words is residue unless the writer's text has it too", () => {
	const left = ["(I'm not picky but I don't eat meat)"];
	assert.equal(residue("soy vegetariano (I'm not picky but I don't eat meat)", es, left), "i'm not picky");
	assert.equal(residue("no soy exigente con la comida, solo que no como carne", es, left), null);
	assert.equal(residue("I'm not picky", es, left, "Saludos. I'm not picky, really."), null);
});

test("the English words of a mixed passage may stay when the writer's language has another script", () => {
	assert.equal(residue("And Darkpaw didn't go back to try again on a clear day", zh, ["didn’t 再试一次 on a clear day"]), null);
});

test("a version that says again what the next sentence says is caught; one that keeps its own words is not", () => {
	const near = "The heating has been broken since Monday. It's very cold at night.\nWhen can it be fixed?";
	assert.equal(
		repeats("Could you send someone this week? It's very cold at night, so it can't wait.", "You must send someone this week.", near),
		"it's very cold at",
	);
	assert.equal(repeats("Could you send someone this week?", "You must send someone this week.", near), null);
	assert.equal(repeats("It's very cold at night, please hurry.", "it's very cold at night, hurry", near), null);
});
