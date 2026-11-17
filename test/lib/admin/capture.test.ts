import { expect, it } from "vitest";
import { cutCapture, cutProblem, joinChatAt, LEARNER_SEAT, mergePeople, parseCapture, withAncestors, withDescendants } from "#lib/admin/capture.ts";
import { versionsSchema } from "#lib/scenario/versions.ts";

const now = Date.parse("2026-11-16T12:00:00Z");
const reddit = JSON.stringify([
	{
		kind: "Listing",
		data: {
			children: [
				{ kind: "t3", data: { title: "Theory", selftext: "Bluestar knew.", subreddit: "WarriorCats", author: "op", created_utc: 1_762_000_000 } },
			],
		},
	},
	{
		kind: "Listing",
		data: {
			children: [
				{
					kind: "t1",
					data: {
						name: "t1_a",
						parent_id: "t3_x",
						author: "ann",
						body: "She did not.",
						created_utc: 1_762_000_100,
						replies: {
							data: {
								children: [{ kind: "t1", data: { name: "t1_b", parent_id: "t1_a", author: "op", body: "She did.", created_utc: 1_762_000_200 } }],
							},
						},
					},
				},
				{ kind: "t1", data: { name: "t1_c", parent_id: "t3_x", author: "[deleted]", body: "[deleted]", created_utc: 1_762_000_300 } },
				{ kind: "t1", data: { name: "t1_d", parent_id: "t3_x", author: "bo", body: "Book six says so.", created_utc: 1_762_000_400 } },
			],
		},
	},
]);

/** A version around a cut, as the editor saves it. */
const version = (cut: ReturnType<typeof cutCapture>) => ({
	title: "T",
	line: "",
	you: "",
	goals: [],
	people: cut.people.map((name) => ({ name, who: "", notes: "" })),
	opening: cut.opening,
	followed: cut.followed,
});

it("reads Reddit's JSON and cuts a thread: a reply brings what it answers, the rest is what followed", () => {
	const capture = parseCapture(reddit);
	expect(capture?.platform).toBe("reddit");
	if (!capture) return;
	expect(capture.messages.map((m) => m.author)).toEqual(["ann", "op", "bo"]);
	expect([...withAncestors(capture, ["t1_b"])].sort()).toEqual(["t1_a", "t1_b"]);
	expect([...withDescendants(capture, ["t1_a"])].sort()).toEqual(["t1_a", "t1_b"]);

	const cut = cutCapture(capture, { opening: ["t1_b"] }, "en", now);
	const opening = cut.opening as { post: { author: string; timestamp?: string }; previousComments: { author: string; replies?: unknown[] }[] };
	expect(opening.post.author).toBe("op");
	expect(opening.post.timestamp).toMatch(/ago$/);
	expect(opening.previousComments).toHaveLength(1);
	expect(opening.previousComments[0].replies).toHaveLength(1);
	expect(cut.followed).toEqual([{ author: "bo", text: "Book six says so." }]);
	// The one the learner answers first: the post's author.
	expect(cut.people).toEqual(["op", "ann"]);
	expect(versionsSchema("exchange", "reddit").safeParse({ en: version(cut) }).success).toBe(true);
});

it("joins a chat at a message: the learner takes that person's place, and what came from there on followed", () => {
	const capture = parseCapture(
		JSON.stringify({
			platform: "discord",
			serverName: "Clan",
			channelName: "general",
			messages: [
				{ id: "1", parent: null, author: "mia", text: "Who finished the book?", time: "2026-11-01T10:00:00Z" },
				{ id: "2", parent: null, author: "kai", text: "Me!" },
				{ id: "3", parent: "2", author: "mia", text: "And?" },
				{ id: "4", parent: null, author: "kai", text: "I cried." },
				{ id: "5", parent: null, author: "lu", text: "Same." },
			],
		}),
	);
	expect(capture?.platform).toBe("discord");
	if (!capture) return;
	const choice = joinChatAt(capture, "4");
	// Before kai's line, without kai's own lines or the answers to them.
	expect(choice.opening).toEqual(["1"]);
	const cut = cutCapture(capture, choice, "en", now);
	expect(cut.followed.map((f) => f.author)).toEqual([LEARNER_SEAT, "lu"]);
	expect(cut.people).toEqual(["mia"]);
	expect(versionsSchema("exchange", "discord").safeParse({ en: version(cut) }).success).toBe(true);
	// Without a seat the learner comes in after the last line.
	expect(joinChatAt(capture).opening).toEqual(["1", "2", "3", "4", "5"]);
});

it("takes an AO3 work's chapter end and end note, and its commenters as people", () => {
	const body = `Chapter 1\n\nLong ago.\n\n* * *\n\nChapter 2\n\n${"A line of the chapter. ".repeat(40)}\n\nShe did not look back.`;
	const capture = parseCapture(
		JSON.stringify({
			platform: "ao3",
			work: {
				title: "Moonlight",
				author: "inkpaw",
				fandoms: ["Warriors"],
				notes: "Enjoy!\n---\nThat's the end! Tell me what stayed with you.",
				body,
			},
			messages: [{ id: "comment_1", parent: null, author: "reader", text: "Loved it", time: "Sat 01 Nov 2026" }],
		}),
	);
	if (!capture) throw new Error("not read");
	const cut = cutCapture(capture, { opening: ["comment_1"] }, "en", now);
	const opening = cut.opening as { bodyExcerpt: string; endNote: string; previousComments: { timestamp?: string }[] };
	expect(opening.bodyExcerpt.endsWith("She did not look back.")).toBe(true);
	expect(opening.bodyExcerpt).not.toContain("Long ago");
	expect(opening.endNote).toBe("That's the end! Tell me what stayed with you.");
	expect(opening.previousComments[0].timestamp).toBe("Sat 01 Nov 2026");
	expect(cut.people).toEqual(["inkpaw", "reader"]);
	expect(versionsSchema("exchange", "ao3").safeParse({ en: version(cut) }).success).toBe(true);
});

it("reads nothing that is not a capture", () => {
	expect(parseCapture("just some text")).toBeNull();
	expect(parseCapture('{"platform":"discord"')).toBeNull();
	expect(parseCapture('{"platform":"myspace","messages":[]}')).toBeNull();
});

it("refuses a cut the version would not save: too many comments under the post, or too many people once merged", () => {
	const many = (n: number, author: (i: number) => string) =>
		JSON.stringify([
			{ kind: "Listing", data: { children: [{ kind: "t3", data: { title: "T", selftext: "B", subreddit: "s", author: "op", created_utc: 1 } }] } },
			{
				kind: "Listing",
				data: {
					children: Array.from({ length: n }, (_, i) => ({
						kind: "t1",
						data: { name: `t1_${i}`, parent_id: "t3_x", author: author(i), body: `c${i}`, created_utc: 2 + i },
					})),
				},
			},
		]);
	const all = (c: NonNullable<ReturnType<typeof parseCapture>>) => cutCapture(c, { opening: c.messages.map((m) => m.id) }, "en", now);
	// Sixty-one comments by one person: one person, but more top-level comments than an opening holds.
	const long = parseCapture(many(61, () => "ann"));
	if (!long) throw new Error("not a capture");
	const tooLong = all(long);
	expect(tooLong.people).toHaveLength(2);
	expect(cutProblem(tooLong, "reddit", [])).toMatch(/at most 60/);
	expect(cutProblem(cutCapture(long, { opening: long.messages.slice(0, 60).map((m) => m.id) }, "en", now), "reddit", [])).toBeNull();
	// Eleven commenters and the poster are twelve; someone already described here makes thirteen.
	const crowd = parseCapture(many(11, (i) => `p${i}`));
	if (!crowd) throw new Error("not a capture");
	const cut = all(crowd);
	const described = { name: "Noor", who: "the moderator", notes: "" };
	expect(cutProblem(cut, "reddit", [{ name: "blank", who: "", notes: "" }])).toBeNull();
	expect(mergePeople([described], cut.people)).toHaveLength(13);
	expect(cutProblem(cut, "reddit", [described])).toMatch(/13 people/);
	// What the editor gets saves.
	const saved = mergePeople([{ name: "op", who: "the poster", notes: "n" }], cut.people);
	expect(saved[0]).toMatchObject({ name: "op", who: "the poster" });
	expect(versionsSchema("exchange", "reddit").safeParse({ en: { ...version(cut), people: saved } }).success).toBe(true);
	// And what it refuses would not have.
	expect(versionsSchema("exchange", "reddit").safeParse({ en: version(tooLong) }).success).toBe(false);
	expect(versionsSchema("exchange", "reddit").safeParse({ en: { ...version(cut), people: mergePeople([described], cut.people) } }).success).toBe(
		false,
	);
});
