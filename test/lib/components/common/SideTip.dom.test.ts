import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SideTip from "$lib/components/common/SideTip.svelte";

let component: ReturnType<typeof SideTip> | null;
beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(110);
	vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(32);
	vi.stubGlobal("innerWidth", 390);
	vi.stubGlobal("innerHeight", 844);
	component = mount(SideTip, { target: document.body });
	flushSync();
});
afterEach(async () => {
	if (component) await unmount(component);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	document.body.innerHTML = "";
});

function show(left: number, top: number, width: number) {
	const anchor = document.createElement("button");
	anchor.getBoundingClientRect = () => new DOMRect(left, top, width, 40);
	if (!component) throw new Error("SideTip is not mounted");
	component.show(anchor, "Opening soon");
	flushSync();
	const tip = document.querySelector<HTMLElement>(".side-tip");
	if (!tip) throw new Error("SideTip did not render its note");
	return tip;
}

describe("SideTip viewport placement", () => {
	it.each([
		[28, 400, 334, "bottom"],
		[20, 400, 100, "right"],
		[250, 400, 100, "left"],
		[28, 820, 334, "bottom"],
		[28, -20, 334, "bottom"],
	])("keeps a measured tip visible beside an anchor at %s, %s", (left, top, width, side) => {
		const tip = show(left, top, width);
		expect(tip.dataset.side).toBe(side);
		expect(Number.parseFloat(tip.style.left)).toBeGreaterThanOrEqual(12);
		expect(Number.parseFloat(tip.style.left) + tip.offsetWidth).toBeLessThanOrEqual(378);
		expect(Number.parseFloat(tip.style.top)).toBeGreaterThanOrEqual(12);
		expect(Number.parseFloat(tip.style.top) + tip.offsetHeight).toBeLessThanOrEqual(832);
	});

	it("replaces and repositions a repeated tip and clears its timer on unmount", async () => {
		show(20, 400, 100);
		vi.advanceTimersByTime(2000);
		const tip = show(250, 500, 100);
		expect(document.querySelectorAll(".side-tip")).toHaveLength(1);
		expect(tip.dataset.side).toBe("left");
		vi.advanceTimersByTime(300);
		flushSync();
		expect(document.querySelector(".side-tip")).not.toBeNull();
		vi.advanceTimersByTime(1900);
		flushSync();
		expect(document.querySelector(".side-tip")).toBeNull();
		show(20, 400, 100);
		if (!component) throw new Error("SideTip is not mounted");
		await unmount(component);
		component = null;
		expect(vi.getTimerCount()).toBe(0);
	});
});
