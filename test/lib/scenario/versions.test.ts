import assert from "node:assert/strict";
import { test } from "vitest";
import { versionProblems, versionsSchema } from "#lib/scenario/versions.ts";

const mail = (from: string) => ({
	en: {
		title: "Tell your landlord the heating is off",
		line: "",
		you: "A tenant",
		people: [{ name: "Greenway Lettings", who: "the letting agent" }],
		goals: [],
		opening: { emails: [{ from, to: "", subject: "Welcome", body: "Hi" }] },
	},
});

test("everyone who writes in an exchange's opening must be one of its people", () => {
	assert.equal(versionsSchema("exchange", "email").safeParse(mail("Greenway Lettings")).success, true);
	const r = versionsSchema("exchange", "email").safeParse(mail("David"));
	assert.equal(r.success, false);
	assert.match(r.error?.message ?? "", /David writes in the opening/);
});

test("what keeps a version from being saved is said in the page's words, a line each", () => {
	const r = versionsSchema("exchange", "reddit").safeParse({
		es: {
			title: " ",
			line: "",
			you: "",
			people: [{ name: "Sam", who: "" }],
			goals: ["Ask", ""],
			opening: { post: { title: "Hi", body: "", subreddit: "", author: "Sam" }, previousComments: [{ author: "Kim", text: "Yo" }] },
		},
	});
	assert.deepEqual(
		versionProblems(r.error?.issues ?? [], (l) => (l === "es" ? "Spanish" : l)),
		["Spanish: Title is empty", "Spanish: Goal 2 is empty", "Spanish: Opening, Subreddit is empty"],
	);
	const people = versionsSchema("exchange", "reddit").safeParse({
		es: {
			title: "T",
			line: "",
			you: "",
			people: [{ name: "Sam", who: "" }],
			goals: [],
			opening: { post: { title: "Hi", body: "", subreddit: "s", author: "Kim" } },
		},
	});
	assert.deepEqual(
		versionProblems(people.error?.issues ?? [], () => "Spanish"),
		["Spanish: Kim writes in the opening but is not one of the people"],
	);
});
