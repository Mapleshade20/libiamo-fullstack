import assert from "node:assert/strict";
import { test } from "vitest";
import { hintOf, verdictOf } from "#lib/review/check.ts";

const own = { kind: "own" as const, answer: "it left him miserable and furious" };
const read = { kind: "collected" as const, answer: "For what it's worth" };

test("a typed answer matches regardless of case, punctuation and curly quotes", () => {
	assert.equal(verdictOf(read, "for what it’s worth!"), "exact");
	assert.equal(verdictOf(own, "It left him miserable and furious."), "exact");
});

test("a small slip is close, not wrong", () => {
	assert.equal(verdictOf(read, "for what its worht"), "close");
});

test("another answer is the learner's to judge on their own sentence, a miss on a collected phrase", () => {
	assert.equal(verdictOf(own, "he became really sad and angry"), "other");
	assert.equal(verdictOf(read, "in my opinion"), "miss");
	assert.equal(verdictOf(read, "   "), "none");
});

test("the hint keeps each word's first letter and length", () => {
	assert.equal(hintOf("For what it's worth"), "F·· w··· i·'· w····");
});

test("reuse finds worked-out phrases in a new text, whatever the case or quotes", async () => {
	const { reused, markReused } = await import("#lib/review/reuse.ts");
	assert.deepEqual(reused("Would it be possible to have ONE more week?", ["would it be possible to have", "I've been visiting her"]), [true, false]);
	assert.deepEqual(
		markReused("So it left him miserable.", ["it left him miserable"]).map((r) => r.hit),
		[false, true, false],
	);
});

test("an entry's cards: its own sentence first, then examples; a collected one in the sentence it was read in", async () => {
	const { noteFaces } = await import("#lib/review/faces.ts");
	const own = noteFaces({
		kind: "own",
		phrase: "it left him …",
		gloss: "what it did to him",
		before: "he went really miserable",
		final: "It left him miserable.",
		examples: [{ t: "The news left her speechless.", n: "消息让她说不出话", span: "left her" }],
	});
	assert.deepEqual(
		own.map((f) => [f.answer, f.was ?? f.cue]),
		[
			["It left him", "he went really miserable"],
			["left her", "消息让她说不出话"],
		],
	);
	const read = noteFaces({
		kind: "collected",
		phrase: "for what it's worth",
		gloss: "offering a view",
		sentence: "For what it's worth, I agree.",
		marked: "For what it's worth",
	});
	assert.equal(read[0].answer, "For what it's worth");
	assert.equal(read[0].cue, "offering a view");
	// Nowhere to blank it: asked bare.
	assert.deepEqual(noteFaces({ kind: "collected", phrase: "slow burn", gloss: "a slow romance" }), [
		{ text: "slow burn", answer: "slow burn", cue: "a slow romance" },
	]);
});

test("a phrase in pieces is one blank from the first piece to the last, with the words between them given", async () => {
	const { around, noteFaces, unmark } = await import("#lib/review/faces.ts");
	assert.deepEqual(unmark("He <m>framed</m> the delay <m>as</m> a <m>chance</m> <m>to rest</m>."), {
		text: "He framed the delay as a chance to rest.",
		span: "framed … as … chance to rest",
		at: [3, 20, 25],
	});
	assert.deepEqual(unmark("No tags."), { text: "No tags." });
	assert.deepEqual(around("He Framed the delay as a rest", "framed … as"), {
		before: "He ",
		part: "Framed the delay as",
		after: " a rest",
		given: ["the delay"],
	});
	// Pieces only in order.
	assert.equal(around("as he framed it", "framed … as"), null);
	const [own, example] = noteFaces({
		kind: "own",
		phrase: "frame something as",
		before: "you said it was a choice",
		final: "So you framed it as a choice.",
		marked: "framed … as",
		examples: [{ t: "He framed the delay as a rest.", n: "他把延误说成休息。", span: "framed … as" }],
	});
	assert.deepEqual(own, {
		text: "So you framed it as a choice.",
		answer: "framed it as",
		at: 7,
		given: ["it"],
		was: "you said it was a choice",
		cue: undefined,
	});
	assert.deepEqual(example, {
		text: "He framed the delay as a rest.",
		answer: "framed the delay as",
		at: 3,
		given: ["the delay"],
		cue: "他把延误说成休息。",
	});
	// The words given stay whole in the first-letters hint.
	assert.equal(hintOf("framed the delay as", ["the delay"]), "f····· the delay a·");
});

test("a blank is the words marked, not the same letters inside another word or the same words earlier", async () => {
	const { around, noteFaces, spanRanges, unmark } = await import("#lib/review/faces.ts");
	// "over" is not the end of "leftover".
	assert.equal(around("I took the leftover bread over to Jo.", "took … over")?.part, "took the leftover bread over");
	// The second "like", where it was marked; without where, the first (the words alone cannot say which).
	const twice = unmark("I like how you <m>like</m> it.");
	assert.deepEqual(twice, { text: "I like how you like it.", span: "like", at: [15] });
	assert.deepEqual(spanRanges(twice.text, "like", twice.at), [[15, 19]]);
	assert.deepEqual(spanRanges(twice.text, "like"), [[2, 6]]);
	const [face] = noteFaces({ kind: "collected", phrase: "like", sentence: twice.text, marked: "like", markedAt: [15] });
	assert.equal(face.at, 15);
	assert.equal(around(face.text, face.answer, [15])?.before, "I like how you ");
	// Every piece where it was marked, not the same word in the words between them.
	const apart = unmark("She <m>put</m> the song that was on the radio <m>on</m> again.");
	assert.equal(around(apart.text, apart.span ?? "", apart.at)?.part, "put the song that was on the radio on");
	// Found in the sentence as written: a lowercased "İ" is two letters, and would move everything after it.
	const turkish = unmark("İstanbul is where I <m>live</m>.");
	assert.equal(around(turkish.text, turkish.span ?? "", turkish.at)?.part, "live");
	assert.equal(around(turkish.text, "live")?.part, "live");
	// Moved since (the sentence changed), it is looked for again; a script written without spaces has no word edges.
	assert.equal(around("You like it.", "like", [15])?.before, "You ");
	assert.equal(around("我很喜欢你", "喜欢")?.part, "喜欢");
});
