import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { handleInvalidField } from "$lib/client/form-attention";
import Select from "$lib/components/common/Select.svelte";

beforeAll(() => {
	window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as never;
});

let component: ReturnType<typeof mount> | null = null;
afterEach(() => {
	if (component) unmount(component);
	component = null;
	document.body.innerHTML = "";
});

function setup(props: Record<string, unknown> = {}) {
	const form = document.createElement("form");
	document.body.append(form);
	component = mount(Select, {
		target: form,
		props: {
			items: [
				{ value: "en", label: "English" },
				{ value: "fr", label: "Français" },
			],
			name: "language",
			...props,
		},
	});
	flushSync();
	const native = form.querySelector<HTMLSelectElement>('select[name="language"]');
	const trigger = form.querySelector<HTMLButtonElement>("[data-control-visual]");
	if (!native || !trigger) throw new Error("Select did not render its parts");
	return { form, native, trigger };
}

describe("Select in a form", () => {
	it("follows a value written straight into the native control, as autofill does", () => {
		const { native, trigger } = setup({ value: "en" });

		native.value = "fr";
		native.dispatchEvent(new Event("change", { bubbles: true }));
		flushSync();

		expect(trigger.textContent).toContain("Français");
		expect(new FormData(native.form ?? undefined).get("language")).toBe("fr");
	});

	it("hands focus and invalid-field feedback to the visible trigger", () => {
		const { native, trigger } = setup({ required: true });

		native.focus();
		expect(document.activeElement).toBe(trigger);

		const invalid = new Event("invalid", { cancelable: true });
		native.dispatchEvent(invalid);
		handleInvalidField(invalid);
		expect(trigger.hasAttribute("data-field-attention")).toBe(true);
	});
});
