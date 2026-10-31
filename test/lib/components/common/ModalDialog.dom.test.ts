import { createRawSnippet, flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ModalDialog from "$lib/components/common/ModalDialog.svelte";

vi.mock("$lib/client/scroll-lock", () => ({ lockBodyScroll: () => () => {} }));

let component: ReturnType<typeof mount> | null = null;
beforeEach(() => {
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		callback(0);
		return 0;
	});
});
afterEach(async () => {
	if (component) await unmount(component);
	component = null;
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

function setup(busy = false) {
	component = mount(ModalDialog, {
		target: document.body,
		props: {
			open: true,
			busy,
			lightDismiss: true,
			labelledby: "dialog-title",
			children: createRawSnippet(() => ({ render: () => '<h2 id="dialog-title">Details</h2>' })),
		},
	});
	const dialog = document.querySelector("dialog");
	if (!dialog) throw new Error("The native dialog was not rendered");
	// jsdom has no top layer or animations; keep the native cancel event and component lifecycle real.
	dialog.showModal = () => {
		dialog.open = true;
	};
	dialog.close = () => {
		dialog.open = false;
		dialog.dispatchEvent(new Event("close"));
	};
	dialog.getAnimations = () => [];
	flushSync();
	expect(dialog.open).toBe(true);
	return dialog;
}

it.each([false, true])("handles native Escape cancellation with busy=%s", async (busy) => {
	const dialog = setup(busy);
	const cancel = new Event("cancel", { cancelable: true });
	dialog.dispatchEvent(cancel);
	flushSync();
	await Promise.resolve();
	flushSync();
	expect(cancel.defaultPrevented).toBe(true);
	expect(dialog.open).toBe(busy);
});

it("does not dismiss a selection dragged from the contents onto the backdrop", () => {
	const dialog = setup();
	dialog.querySelector("h2")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
	dialog.click();
	flushSync();
	expect(dialog.open).toBe(true);
});
