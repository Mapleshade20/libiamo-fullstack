import { flushSync, tick } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import MailUI from "$lib/components/practice/ui/mail/MailUI.svelte";
import { mountSurface, persisted, persistedSession, surfaceProps } from "../../support/surface.svelte";
import { button, type } from "../surfaces";

const mocks = vi.hoisted(() => ({
	sendMessage: vi.fn(async (_sessionId: number, _text: string, _clientMessageId: string) => ({ status: "pending" })),
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn(), invalidate: vi.fn(async () => {}) }));
vi.mock("$app/paths", () => ({ base: "/libiamo" }));
vi.mock("$lib/components/account/trial-quota", () => ({ refreshTrialQuota: vi.fn(async () => {}) }));
vi.mock("$lib/components/practice/session/actions", () => ({
	postPageAction: vi.fn(),
	sendMessage: mocks.sendMessage,
	actionError: () => undefined,
}));

beforeAll(() => {
	window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never;
	Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {} })) as never;
});

let destroy: (() => void) | undefined;
afterEach(() => {
	destroy?.();
	document.body.innerHTML = "";
	localStorage.clear();
});

const opening = { emails: [{ from: "Maya Chen <maya@x.example>", subject: "Dinner?", body: "Free Friday?" }] };

function open() {
	const props = surfaceProps({ openingState: opening, session: persistedSession([]) });
	const mounted = mountSurface(MailUI, props);
	destroy = mounted.destroy;
	return { props, root: mounted.target };
}

async function settle() {
	for (let index = 0; index < 5; index += 1) await tick();
	flushSync();
}

describe("Mail surface", () => {
	it("announces a reply that arrives while the learner looks at Sent", async () => {
		const { props, root } = open();
		button(root, "New Message").click();
		flushSync();
		type(document, "[role=dialog] textarea", "Friday works.");
		button(document.querySelector("[role=dialog]") as HTMLElement, "Send").click();
		await settle();
		expect(root.querySelector("#mail-list-title")?.textContent).toBe("Sent");

		const [, text, clientMessageId] = mocks.sendMessage.mock.calls[0];
		props.session = persistedSession([
			persisted(1, "user", text, { clientMessageId }),
			persisted(2, "assistant", "Great, 7pm.", { clientMessageId }),
		]);
		flushSync();

		expect(root.querySelector("#mail-list-title")?.textContent).toBe("Sent");
		expect(root.querySelector('[aria-label="1 unread"]')).not.toBeNull();
		expect(root.querySelector("[aria-live=polite]")?.textContent).toBe("1 unread");
	});

	it("closes the composer on Escape and keeps the unsent draft for next time", async () => {
		const { root } = open();
		button(root, "New Message").click();
		flushSync();
		type(document, "[role=dialog] textarea", "Half a thought");

		document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await settle();
		expect(document.querySelector("[role=dialog]")).toBeNull();

		button(root, "New Message").click();
		flushSync();
		expect((document.querySelector("[role=dialog] textarea") as HTMLTextAreaElement).value).toBe("Half a thought");
	});
});
