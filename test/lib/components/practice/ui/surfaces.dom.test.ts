import { flushSync, tick } from "svelte";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSurface, persisted, persistedSession, surfaceProps } from "../support/surface.svelte";
import { button, SURFACES } from "./surfaces";

const mocks = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	invalidate: vi.fn(async () => {}),
	postPageAction: vi.fn(),
	sendMessage: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto: mocks.goto, invalidate: mocks.invalidate }));
vi.mock("$app/paths", () => ({ base: "/libiamo" }));
vi.mock("$lib/components/account/trial-quota", () => ({ refreshTrialQuota: vi.fn(async () => {}) }));
vi.mock("$lib/components/practice/session/actions", () => ({
	postPageAction: mocks.postPageAction,
	sendMessage: mocks.sendMessage,
	actionError: () => undefined,
}));

async function settle() {
	for (let index = 0; index < 5; index += 1) await tick();
	flushSync();
}

beforeAll(() => {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("min-width"),
		media: query,
		addEventListener() {},
		removeEventListener() {},
	})) as never;
	Element.prototype.scrollIntoView = () => {};
	// Svelte transitions drive the Web Animations API, which jsdom lacks.
	Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, onfinish: null })) as never;
});

beforeEach(() => {
	mocks.postPageAction.mockResolvedValue({ type: "success", data: { success: true } });
	mocks.sendMessage.mockResolvedValue({ status: "pending" });
});

let destroy: (() => void) | undefined;
afterEach(() => {
	destroy?.();
	document.body.innerHTML = "";
	vi.clearAllMocks();
});

describe.each(SURFACES)("$name surface", (surface) => {
	function open(messages = surface.history(persisted)) {
		const props = surfaceProps({ openingState: surface.openingState, session: persistedSession(messages) });
		const mounted = mountSurface(surface.component, props);
		destroy = mounted.destroy;
		return { props, root: mounted.target };
	}

	it("hydrates the stored conversation without starting a new session", () => {
		const { root } = open();

		for (const text of surface.visible) expect(root.textContent).toContain(text);
		expect(mocks.postPageAction).not.toHaveBeenCalled();
	});

	it("sends the learner's words in the surface's stored format and keeps them visible while the reply is pending", async () => {
		const { root } = open();

		await surface.compose(root, "See you there");
		await settle();

		expect(mocks.sendMessage.mock.calls[0].slice(0, 2)).toEqual([11, surface.sent("See you there")]);
		expect(mocks.invalidate).toHaveBeenCalledWith("app:practice-session");
		if (surface.name !== "Mail") expect(root.textContent).toContain("See you there");
	});

	it("shows a reply delivered by a later poll", () => {
		const { props, root } = open();

		props.session = persistedSession([...surface.history(persisted), persisted(3, "assistant", "One more thing")]);
		flushSync();

		expect(root.textContent).toContain("One more thing");
	});

	it("offers Retry for a failed reply and resends the stored text", async () => {
		const [learner] = surface.history(persisted);
		const { root } = open([{ ...learner, llmMetadata: { ...(learner.llmMetadata as object), failed: true } }]);

		button(root, "Retry").click();
		await settle();

		expect(mocks.sendMessage.mock.calls[0].slice(0, 3)).toEqual([11, learner.content, "c1"]);
	});

	it("finishes after confirmation and opens the feedback page", async () => {
		const { root } = open();

		button(root, "Finish task").click();
		flushSync();
		button(document.body, "Finish & review").click();
		await settle();

		expect(mocks.postPageAction).toHaveBeenCalledWith("complete", { sessionId: 11 });
		expect(mocks.goto).toHaveBeenCalledWith("/libiamo/task/5/feedback");
	});
});
