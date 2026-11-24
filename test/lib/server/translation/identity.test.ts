import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import { sourceIdentity } from "#lib/server/translation/identity.ts";

const v = { title: "Menu", line: "", introduction: "", original: "Soup", where: "a menu", readers: "diners", terms: [] };

test("an empty leave-out list leaves every source made before it current", () => {
	const before = createHash("sha256")
		.update(JSON.stringify(["work", { ...v }]))
		.digest("hex");
	assert.equal(sourceIdentity(v, "work"), before);
	assert.equal(sourceIdentity({ ...v, leaveOut: [] }, "work"), before);
	assert.notEqual(sourceIdentity({ ...v, leaveOut: ["Soup"] }, "work"), before);
});
