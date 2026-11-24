import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { Caller, chatJson } from "#lib/server/llm/caller.ts";
import { alreadyTheirs, notesFor } from "#lib/server/revision/calls.ts";

vi.mock("#lib/server/llm/caller.ts", async (original) => ({ ...(await original<object>()), chatJson: vi.fn() }));

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

test("an entry says where its expression is in their sentence and in each example, and only words that are there", async () => {
	const note = { lesson: "", file: true, meaning: "m", usage: "u" };
	vi.mocked(chatJson).mockResolvedValue({
		value: {
			notes: [
				{
					...note,
					n: 1,
					phrase: "frame something as",
					ended: "you <m>framed</m> it <m>as</m> a choice",
					examples: [
						{ t: "He <m>framed</m> the delay <m>as</m> a rest.", n: "a" },
						{ t: "Nothing marked.", n: "b" },
					],
				},
				// The copy was not theirs: no place in their sentence, the phrase stands.
				{ ...note, n: 2, phrase: "look forward to", ended: "I <m>long for</m> it", examples: [] },
			],
		},
		calls: [],
	} as never);
	const item = (final: string, after: string) => ({ orig: "", final, before: "said", after, problem: "", why: [], how: "rebuilt" as const });
	const notes = await notesFor(
		{ target: "en", learner: "zh-CN", feedback: "native", scene: { platform: "Reddit" } } as never,
		[item("So you framed it as a choice.", "framed it as"), item("I look forward to it.", "look forward to")],
		new Caller({ route: null }),
	);
	assert.deepEqual(notes, [
		{
			phrase: "frame something as",
			meaning: "m",
			usage: "u",
			marked: "framed … as",
			examples: [
				{ t: "He framed the delay as a rest.", n: "a", span: "framed … as" },
				{ t: "Nothing marked.", n: "b" },
			],
		},
		{ phrase: "look forward to", meaning: "m", usage: "u", examples: [] },
	]);
});
