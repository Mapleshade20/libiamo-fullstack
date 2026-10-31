import { flushSync, mount, unmount } from "svelte";
import { expect, it } from "vitest";
import ResizeableTextarea from "$lib/components/practice/ui/discord/ResizeableTextarea.svelte";

it("keeps active-descendant focus on a native, tabbable textarea", async () => {
	const target = document.createElement("div");
	document.body.append(target);
	const component = mount(ResizeableTextarea, {
		target,
		props: { label: "Message", role: "combobox", "aria-activedescendant": "member-1", "aria-expanded": true },
	});
	try {
		flushSync();
		const textarea = target.querySelector("textarea");
		expect(textarea?.tabIndex).toBe(0);
		textarea?.focus();
		expect(document.activeElement).toBe(textarea);
		expect(textarea?.getAttribute("aria-activedescendant")).toBe("member-1");
	} finally {
		await unmount(component);
		target.remove();
	}
});
