import { flushSync, tick } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import RedditUI from "$lib/components/practice/ui/reddit/RedditUI.svelte";
import { mountSurface, persistedSession, surfaceProps } from "../../support/surface.svelte";

vi.mock("$app/navigation", () => ({ goto: vi.fn(), invalidate: vi.fn(async () => {}) }));
vi.mock("$app/paths", () => ({ base: "" }));
vi.mock("$lib/components/account/trial-quota", () => ({ refreshTrialQuota: vi.fn(async () => {}) }));
vi.mock("$lib/components/practice/session/actions", () => ({ postPageAction: vi.fn(), sendMessage: vi.fn(), actionError: () => undefined }));

beforeAll(() => {
	Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {} })) as never;
});

let destroy: (() => void) | undefined;
afterEach(() => destroy?.());

describe("Reddit surface", () => {
	it("keeps a nested thread collapsed when its ancestor is collapsed and expanded again", async () => {
		const props = surfaceProps({
			openingState: {
				post: { title: "Best trail?", author: "OP" },
				previousComments: [
					{
						id: "c1",
						author: "alex",
						text: "Ridge",
						replies: [{ id: "c2", author: "luma", text: "Agreed", replies: [{ id: "c3", author: "sam", text: "Deep reply" }] }],
					},
				],
			},
			session: persistedSession([]),
		});
		const mounted = mountSurface(RedditUI, props);
		destroy = mounted.destroy;
		const toggles = () =>
			[...mounted.target.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].filter((button) => /\[[+−]\]/.test(button.textContent ?? ""));

		toggles()[1].click();
		flushSync();
		toggles()[0].click();
		flushSync();
		toggles()[0].click();
		flushSync();
		await tick();

		expect(toggles().map((toggle) => toggle.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
		// The nested comment is back, still collapsed: its header shows, its reply does not.
		expect(mounted.target.textContent).toContain("luma");
		expect(mounted.target.textContent).not.toContain("Deep reply");
	});
});
