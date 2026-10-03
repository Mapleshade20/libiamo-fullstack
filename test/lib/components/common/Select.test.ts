import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import Select from "$lib/components/common/Select.svelte";

const items = [
	{ value: "en", label: "English" },
	{ value: "fr", label: "Français" },
];

describe("Select", () => {
	it("mirrors the chosen value into a named native select, so forms and the first paint carry it", () => {
		const { body } = render(Select, { props: { items, name: "language", value: "fr", required: true, id: "language" } });

		expect(body).toMatch(/<select name="language"[^>]*required/);
		expect(body).toMatch(/<option value="fr"[^>]*selected/);
		expect(body).not.toContain('<option value=""');
		// The trigger is the labelled, visible control and shows the label, not the value.
		expect(body).toMatch(/<button(?=[^>]*id="language")(?=[^>]*data-control-visual)[^>]*>/);
		expect(body).toContain("Français");
	});

	it("keeps an empty native choice selected until something is picked", () => {
		const { body } = render(Select, { props: { items, name: "language", placeholder: "Pick one", required: true } });

		expect(body).toMatch(/<option value=""[^>]*selected/);
		expect(body).toContain("Pick one");
	});
});
