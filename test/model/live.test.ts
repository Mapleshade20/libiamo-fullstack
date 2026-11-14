// Session state paths the page drives (no model calls: the caller has no key, so any call stops).
import assert from "node:assert/strict";
import { test } from "vitest";
import { Caller } from "#lib/server/llm/caller.ts";
import { LiveSession } from "#model/session/live.ts";

const nokey = new Caller({ route: null });

function session(text: string) {
	const s = new LiveSession({ text, learner: "zh-CN", feedback: "native" }, nokey);
	const x = s as any;
	x.d = {
		id: "t",
		text,
		target: "en",
		learner: "zh-CN",
		feedback: "zh-CN",
		level: "B2",
		scene: { platform: "AO3", audience: "fans", purpose: "praise" },
	};
	return { s, x };
}
const change = (text: string, before: string, after: string, id: string) => {
	const from = text.indexOf(before);
	return { from, to: from + before.length, before, after, id, pass: 1, kind: "word", note: "" };
};

test("answers A, then B, then A again: the server's text follows the last answers", () => {
	const { s, x } = session("I likes it.");
	x.p1 = [change("I likes it.", "likes", "like", "p1")];
	assert.equal(s.pass1Done({}, []).text, "I like it.");
	assert.equal(s.pass1Done({ p1: "love" }, []).text, "I love it.");
	assert.equal(s.pass1Done({}, []).text, "I like it.");
	assert.equal(s.pass1Done({}, ["p1"]).text, "I likes it.");
});

test("a change the writer turned down in pass 1 does not count as fixing a pass-2 spot there", () => {
	const text = "This is bad.";
	const { s, x } = session(text);
	x.p1 = [change(text, "bad", "terrible", "p1")];
	s.pass1Done({}, ["p1"]);
	const analysis = {
		gist: "",
		map: [],
		spots: [
			{ kind: "formulation", quote: "bad", problem: "vague", scope: "words", sentences: [1], mode: "one", readings: [{ label: "a", meaning: "a" }] },
		],
	};
	assert.equal(x.plan(analysis, null).stops.length, 1);
	s.pass1Done({}, []);
	assert.equal(x.plan(analysis, null).stops.length, 0);
});

test("a fix of case is graded again; the same words with another final mark are not", async () => {
	const { s, x } = session("i like it");
	const failed = { pass: false, reader: null, tutor: "Capitalise I", round: 1, repaired: null };
	x.stops = [
		{
			id: "s1",
			from: 0,
			to: 9,
			parts: [],
			label: "",
			history: [],
			round: 1,
			seen: new Set(),
			ticks: [],
			graded: new Map([["i like it", failed]]),
			m: {
				replaces: "i like it",
				ref: "I [really] like it",
				alts: [],
				pieces: [],
				construct: "",
				why: [],
				checks: [],
				success: "",
				prompt: "",
				reader: "",
			},
			reading: "r",
			problem: "p",
		},
	];
	const again = await s.grade("s1", "i like it.");
	assert.match("tutor" in again ? again.tutor : "", /Capitalise I/);
	// A new grade is asked for, which fails here only because no model is reachable.
	await assert.rejects(s.grade("s1", "I like it."));
});

test("the reference word for word passes without a grading call", async () => {
	const { s, x } = session("i like it");
	x.stops = [
		{
			id: "s1",
			from: 0,
			to: 9,
			parts: [],
			label: "",
			history: [],
			round: 0,
			seen: new Set(),
			ticks: [],
			graded: new Map(),
			m: {
				replaces: "i like it",
				ref: "I [really] like it",
				alts: ["I love it"],
				pieces: [],
				construct: "",
				why: [{ label: "really", note: "" }],
				checks: [],
				success: "yay",
				prompt: "",
				reader: "",
			},
			reading: "r",
			problem: "p",
		},
	];
	for (const a of ["I really like it.", "I love it"]) {
		const g = await s.grade("s1", a);
		assert.equal(g.pass, true, a);
	}
});

test("a corrected note replaces the old one, and only once the scene is in", async () => {
	const s = new LiveSession({ text: "Hi all", background: "old note", learner: "zh-CN", feedback: "native" }, nokey);
	// No model is reachable here, so the scene call fails and the note stays as it was.
	await assert.rejects(s.inferScene("new note"));
	assert.equal(s.input.background, "old note");
});

test("other readings are never prepared on a guess, even when the learner must choose", async () => {
	for (const [mode, expected] of [
		["one", 1],
		["ask", 1],
	] as const) {
		const { s, x } = session("This is bad.");
		x.stops = [
			{
				id: "s1",
				from: 8,
				to: 11,
				parts: [
					{
						problem: "p",
						mode,
						readings: [
							{ label: "a", meaning: "a" },
							{ label: "b", meaning: "b" },
						],
					},
				],
				label: "",
				history: [],
				round: 0,
				seen: new Set(),
				ticks: [],
				graded: new Map(),
			},
		];
		const asked: string[][] = [];
		// Stand-in for the material call: it records what was asked for and stops there.
		x.fetch = (_stop: unknown, means: string[]) => {
			asked.push(means);
			const m = Promise.reject(new Error("no model"));
			m.catch(() => {});
			return { purpose: "p", reading: means[0], problem: "p", m };
		};
		await assert.rejects(s.material("s1"));
		assert.equal(asked.length, expected, mode);
	}
});
