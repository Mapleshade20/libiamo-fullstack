import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import Field from "$lib/components/common/Field.svelte";

describe("Field", () => {
	it("labels its control and ties a server error to the field name", () => {
		const { body } = render(Field, {
			props: {
				label: "Name",
				for: "dataset-name",
				name: "name",
				required: true,
				error: "Name is required.",
				children: createRawSnippet(() => ({ render: () => '<input id="dataset-name" name="name">' })),
			},
		});

		expect(body).toContain('<label for="dataset-name"');
		expect(body).toMatch(/data-field-error="name"[^>]*>Name is required\./);
		expect(body).toContain("data-field-container");
	});
});
