import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import QuestMenuInbox from "$lib/components/quest-hall/QuestMenuInbox.svelte";

vi.mock("$app/paths", () => ({ base: "/libiamo" }));

beforeAll(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
});

let component: ReturnType<typeof mount>;
afterEach(async () => {
	await unmount(component);
	document.body.innerHTML = "";
});

function setup() {
	component = mount(QuestMenuInbox, {
		target: document.body,
		props: {
			lang: "en",
			status: "ready",
			total: 1,
			announcements: [1, 2].map((id) => ({ id, title: `Notice ${id}`, body: "Message", publishedAt: new Date("2026-10-05T00:00:00Z"), read: false })),
			items: [
				{ sessionId: 3, taskId: 4, lineupId: 5, title: "Reply", ui: "discord", sessionStatus: "in_progress", unreadCount: 1, latestAgeSeconds: 10 },
			],
		},
	});
	flushSync();
	const first = document.querySelector<HTMLButtonElement>("#announcement-1-summary");
	const second = document.querySelector<HTMLElement>("#announcement-2-summary")?.closest("article");
	const reply = document.querySelector<HTMLAnchorElement>("a.notification");
	if (!first || !second || !reply) throw new Error("Inbox did not render its entries");
	return { first, second, reply };
}

describe("announcement inbox navigation", () => {
	it("exposes all entries on the first touch without acknowledging an announcement", () => {
		const { first, second, reply } = setup();
		expect(second.inert).toBe(true);
		expect(reply.inert).toBe(true);
		const pointer = new Event("pointerdown", { bubbles: true });
		Object.defineProperty(pointer, "pointerType", { value: "touch" });
		first.dispatchEvent(pointer);
		first.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
		flushSync();
		expect(first.getAttribute("aria-expanded")).toBe("false");
		expect(second.inert).toBe(false);
		expect(reply.inert).toBe(false);
		expect(reply.getAttribute("href")).toBe("/libiamo/task/4/session?lineup=5");
		const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
		reply.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(false);
	});

	it.each(["ArrowDown", "Enter"])("lets keyboard users reach replies with %s and open a notice afterwards", (key) => {
		const { first, second, reply } = setup();
		first.focus();
		if (key === "Enter") first.click();
		else first.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
		flushSync();
		expect(second.inert).toBe(false);
		expect(reply.inert).toBe(false);
		first.click();
		flushSync();
		expect(first.getAttribute("aria-expanded")).toBe("true");
		expect(reply.inert).toBe(true);
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		flushSync();
		expect(first.getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(first);
	});
});
