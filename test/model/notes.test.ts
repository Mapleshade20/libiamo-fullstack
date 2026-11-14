import assert from "node:assert/strict";
import { test } from "vitest";
import { alreadyTheirs } from "#model/session/calls.ts";

test("a phrase with a word the change brought in is new to the learner", () => {
	assert.equal(alreadyTheirs("furious about", "for", "about"), false);
	assert.equal(alreadyTheirs("tiene sentido", "hace", "tiene"), false);
	assert.equal(alreadyTheirs("Keep it up!", "up with this!", "it up!"), false);
});

test("a phrase made only of words the learner already wrote there is theirs", () => {
	// They wrote "overcast" themselves; pass 2 only moved it.
	assert.equal(
		alreadyTheirs("overcast", "it was mentioned in the book that it was a overcast day", "The book actually mentions it was an overcast day"),
		true,
	);
	// One of their own alternatives picked.
	assert.equal(alreadyTheirs("it would be hard", "it would be hard / not worth it", "it would be hard"), true);
});
