import assert from "node:assert/strict";
import { test } from "vitest";
import { replyIn } from "#lib/server/revision/draft.ts";
import { parseSource, plainSource, renderSource, sourceKind, withoutDraft } from "#lib/server/writing/source.ts";

/** A capture that must parse. */
function parsed(text: string) {
	const s = parseSource(text);
	if (!s) throw new Error("the capture did not parse");
	return s;
}

const draft = "Actually later revealed as Stormfang xD";
const capture = JSON.stringify({
	platform: "ao3",
	work: {
		title: "just when that day is coming",
		author: "solacefruit",
		fandoms: ["Warriors"],
		body: "Brokentail lay waiting under a blackthorn bush.",
	},
	messages: [
		{ id: "c1", parent: null, author: "Icej", text: "I wonder if her original warrior name was Thistlewhisker, then?" },
		{ id: "c2", parent: "c1", author: "Maplefur", text: "Actually later revealed as Stormfang xD" },
		{ id: "c3", parent: "c2", author: "Icej", text: "Oh, thanks!" },
		{
			id: "c4",
			parent: null,
			author: "Someone",
			text: `Someone said "Actually later revealed as Stormfang xD" and I laughed so much at that, honestly the whole thread is great and I keep rereading it.`,
		},
		{ id: "c5", parent: "gone", author: "Late", text: "Lovely." },
	],
});

test("the writer's own posted draft and the replies under it are not context", () => {
	const s = withoutDraft(parsed(capture), draft);
	assert.deepEqual(
		s.messages.map((m) => m.id),
		["c1", "c4", "c5"],
	);
});

test("a reply whose parent was not captured stands at the top level, and the import reads with what each answers", () => {
	const s = parsed(capture);
	assert.equal(s.messages.find((m) => m.id === "c5")?.parent, null);
	assert.match(renderSource(s), /Maplefur \(replying to Icej \[c1\]\)/);
	assert.match(renderSource(s), /Brokentail lay waiting/);
});

test("only what a capture script copied is an import; text of the writer's own is not", () => {
	assert.equal(parseSource("{ not json\nsecond line"), null);
	assert.equal(parseSource("The comment I am answering said I was wrong."), null);
	assert.equal(parseSource(JSON.stringify({ platform: "tumblr", messages: [] })), null);
});

test("the brief's reply section is the message answered, or nothing", () => {
	const brief =
		'- What it is: a fic.\n- Replying to: Icej: "I wonder if her original warrior name was Thistlewhisker, then?"\n- How people write here: casual.';
	assert.equal(replyIn(brief), 'Icej: "I wonder if her original warrior name was Thistlewhisker, then?"');
	assert.equal(replyIn("**Replying to:** none\n**How people write here:** casual"), undefined);
	assert.equal(replyIn("## Replying to\nnone.\n## How people write here\nx"), undefined);
});

test("text without spaces: the writer's own posted Chinese draft is found and dropped", () => {
	const zh = "我觉得他是在说服自己忽视身边的善意，这一点写得特别好。";
	const cap = JSON.stringify({
		platform: "discord",
		serverName: "s",
		channelName: "c",
		messages: [
			{ id: "1", parent: null, author: "a", text: "大家觉得这一章怎么样？" },
			{ id: "2", parent: "1", author: "me", text: zh },
			{ id: "3", parent: "2", author: "b", text: "同意！" },
		],
	});
	assert.deepEqual(
		withoutDraft(parsed(cap), zh).messages.map((m) => m.id),
		["1"],
	);
});

test("a capture with a stray character around it still reads; a cut capture is broken, not text", () => {
	const capture = JSON.stringify({ platform: "discord", serverName: "s", channelName: "c", messages: [{ id: "1", author: "a", text: "hi" }] });
	assert.equal(sourceKind(`x${capture}`), "capture");
	assert.equal(sourceKind(`${capture}]`), "capture");
	assert.equal(sourceKind(capture.slice(0, -5)), "broken");
	assert.equal(sourceKind("Someone wrote {this} in a thread.\n\nAnd a reply."), "text");
	assert.equal(sourceKind("  "), "empty");
});

test("pasted text keeps everything but the paragraph that is the draft", () => {
	const draft = "I loved how the ending tied back to the first chapter, it made me cry.";
	const s = withoutDraft(plainSource(`alice: what did everyone think?\n\n${draft}\n\nbob: same here`), draft);
	assert.equal(s.head, "alice: what did everyone think?\n\nbob: same here");
	assert.equal(renderSource(s), s.head);
});

test("chat logs with bracketed times are text", () => {
	assert.equal(sourceKind("[10:42] alice: hi\n[10:43] bob: hey"), "text");
});
