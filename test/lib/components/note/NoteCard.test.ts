import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import NoteCard from "$lib/components/note/NoteCard.svelte";

describe("NoteCard", () => {
	it("uses prose typography for archived note content", () => {
		const { body } = render(NoteCard, {
			props: {
				note: {
					id: 7,
					vocab: "prendre son temps",
					nativeDefinition: "to take one's time",
					targetDefinition: "faire quelque chose sans se presser",
				},
			},
		});

		expect(body.match(/font-prose/g)).toHaveLength(3);
		expect(body).toContain("prendre son temps");
		expect(body).toContain("Ask about this");
	});
});
