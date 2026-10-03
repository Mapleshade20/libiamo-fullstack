import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import Checkbox from "$lib/components/common/Checkbox.svelte";
import Switch from "$lib/components/common/Switch.svelte";

describe("Switch and Checkbox", () => {
	it("stay native checkboxes so forms and labels keep working", () => {
		const toggle = render(Switch, { props: { name: "capture", checked: true, id: "capture" } }).body;
		expect(toggle).toMatch(/<input type="checkbox" role="switch"(?=[^>]*\bchecked)(?=[^>]*name="capture")[^>]*>/);

		const box = render(Checkbox, { props: { name: "pick", checked: false } }).body;
		expect(box).toMatch(/<input type="checkbox"[^>]*name="pick"/);
		expect(box).not.toMatch(/<input[^>]*\bchecked/);
	});
});
