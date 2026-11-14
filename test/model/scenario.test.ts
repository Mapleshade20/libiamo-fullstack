import assert from "node:assert/strict";
import { test } from "vitest";
import { type Case, draftOf, exchange, replyTo, SEP, turnAt } from "#model/scenario/exchange.ts";
import { turnSentences } from "#model/scenario/pass2.ts";

const c: Case = {
	id: "t",
	place: "mail",
	lang: "en",
	notes: "",
	scene: { platform: "Email", where: "inbox", you: "a tenant", goals: ["get it fixed"], cast: [{ name: "David", who: "landlord" }] },
	before: [{ id: "b0", author: "David", text: "Welcome!" }],
	transcript: [
		{ id: "t1", author: "Me", learner: true, text: "To: David\nSubject: heating\n\nIt is broken. You must fix it." },
		{ id: "t2", author: "David", text: "I can't promise this week." },
		{ id: "t3", author: "Me", learner: true, text: "Sorry. Any morning works." },
		{ id: "t4", author: "Ann", text: "unrelated" },
		{ id: "t5", author: "David", replyTo: "t3", text: "Thursday, then." },
	],
};

test("the draft is the learner's turns between separator lines, the To line dropped and the subject kept", () => {
	const d = draftOf(c);
	assert.equal(d.text, `Subject: heating\n\nIt is broken. You must fix it.\n\n${SEP}\n\nSorry. Any morning works.`);
	assert.equal(turnAt(d.text, d.text.indexOf("You must")), 1);
	assert.equal(turnAt(d.text, d.text.indexOf("Any morning")), 2);
});

test("a turn's reply is the message that answers it, else the next one from someone else", () => {
	assert.equal(replyTo(c, 1)?.text, "I can't promise this week.");
	assert.equal(replyTo(c, 2)?.text, "Thursday, then.");
	assert.equal(replyTo(c, 3), undefined);
});

test("the exchange can stop before a turn, so nothing said later reaches it", () => {
	const upTo = exchange(c, { upTo: 1 });
	assert.match(upTo, /I can't promise/);
	assert.doesNotMatch(upTo, /Any morning|Thursday/);
});

test("sentences by turn keep the numbering of the whole text, the separator taking a number of its own", () => {
	const by = turnSentences(draftOf(c).text, "en");
	assert.deepEqual(
		by.map((t) => t.turn),
		[1, 2],
	);
	const last = by[0].ss.at(-1)?.id ?? 0;
	assert.equal(by[1].ss[0].id, last + 2);
});
