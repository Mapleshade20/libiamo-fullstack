import { flushSync, mount, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import MarkedText from "$lib/components/common/MarkedText.svelte";

let component: ReturnType<typeof mount> | null = null;
afterEach(async () => {
	if (component) await unmount(component);
	component = null;
	window.getSelection()?.removeAllRanges();
	document.body.innerHTML = "";
});

it("exposes inline annotations to keyboard users without opening them during text selection", () => {
	const onMarkClick = vi.fn();
	component = mount(MarkedText, {
		target: document.body,
		props: {
			parts: [
				{ type: "text", content: "Before " },
				{ type: "mark", content: "annotated text" },
			],
			onMarkClick,
		},
	});
	flushSync();
	const mark = document.querySelector<HTMLElement>('mark[role="button"]');
	if (!mark) throw new Error("The inline annotation was not rendered");
	mark.focus();
	expect(document.activeElement).toBe(mark);
	for (const key of ["Enter", " "]) {
		const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
		mark.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	}
	expect(onMarkClick).toHaveBeenCalledTimes(2);
	expect(onMarkClick).toHaveBeenLastCalledWith("annotated text", mark);
	onMarkClick.mockClear();
	const selection = window.getSelection();
	const range = document.createRange();
	range.selectNodeContents(mark);
	selection?.removeAllRanges();
	selection?.addRange(range);
	expect(selection?.toString()).toBe("annotated text");
	mark.click();
	expect(onMarkClick).not.toHaveBeenCalled();
	selection?.removeAllRanges();
	mark.click();
	expect(onMarkClick).toHaveBeenCalledOnce();
});
