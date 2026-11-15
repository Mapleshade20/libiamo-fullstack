import assert from "node:assert/strict";
import { test } from "vitest";
import { versionsSchema } from "#lib/scenario/versions.ts";

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
