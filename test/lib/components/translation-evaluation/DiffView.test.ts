import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import DiffView from "$lib/components/translate-evaluation/DiffView.svelte";
import type { DiffPart } from "$lib/components/translate-evaluation/types";

const parts: DiffPart[] = [
	{ type: "unchanged", text: "Keep " },
	{ type: "replace", from: "old wording", to: "new wording" },
	{ type: "delete", text: " obsolete" },
	{ type: "add", text: " added" },
];

describe("DiffView", () => {
	it("keeps the standard before-and-after presentation", () => {
		const { body } = render(DiffView, { props: { parts, animate: false } });
		expect(body).toContain("old wording");
		expect(body).toContain("new wording");
		expect(body).toContain("obsolete");
		expect(body).toContain('class="diff-delete ');
		expect(body).toContain('class="diff-add ');
	});
});
