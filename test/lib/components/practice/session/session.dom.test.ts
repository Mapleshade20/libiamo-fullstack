import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeSession, PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";
import { getDeliveryDelayMs } from "$lib/practice/reply-timing";
import SessionHarness from "../support/SessionHarness.svelte";
import { persisted, persistedSession, surfaceProps } from "../support/surface.svelte";

const mocks = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	invalidate: vi.fn(async () => {}),
	refreshTrialQuota: vi.fn(async () => {}),
	postPageAction: vi.fn(),
	sendMessage: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto: mocks.goto, invalidate: mocks.invalidate }));
vi.mock("$app/paths", () => ({ base: "/libiamo" }));
vi.mock("$lib/components/account/trial-quota", () => ({ refreshTrialQuota: mocks.refreshTrialQuota }));
vi.mock("$lib/components/practice/session/actions", () => ({
	postPageAction: mocks.postPageAction,
	sendMessage: mocks.sendMessage,
	actionError: (result: { data?: { error?: string } }) => result.data?.error,
}));

let cleanup: (() => void) | undefined;

function start(props: PracticeSurfaceProps): PracticeSession {
	let session: PracticeSession | undefined;
	const target = document.createElement("div");
	const instance = mount(SessionHarness, { target, props: { props, onSession: (value: PracticeSession) => (session = value) } });
	flushSync();
	cleanup = () => unmount(instance);
	if (!session) throw new Error("session was not created");
	return session;
}

async function settle() {
	for (let index = 0; index < 5; index += 1) await tick();
	flushSync();
}

const texts = (session: PracticeSession) => session.messages.map((message) => message.text || `(${message.deliveryState})`);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
	vi.setSystemTime(new Date("2026-09-25T09:30:00Z"));
	mocks.postPageAction.mockResolvedValue({ type: "success", data: { success: true } });
});

afterEach(() => {
	cleanup?.();
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("createPracticeSession", () => {
	it("renders opening history and persisted messages synchronously, without starting a new session", () => {
		const props = surfaceProps({
			openingState: { previousMessages: [{ sender: "Roddy", text: "hey there" }] },
			session: persistedSession([
				persisted(1, "user", "hi Roddy", { clientMessageId: "c1" }),
				persisted(2, "assistant", "what's up?", { clientMessageId: "c1" }),
			]),
		});
		const session = start(props);

		expect(texts(session)).toEqual(["hey there", "hi Roddy", "what's up?"]);
		expect(session.agentName).toBe("Roddy");
		expect(session.currentTurns).toBe(1);
		expect(mocks.postPageAction).not.toHaveBeenCalledWith("start");
	});

	it("starts a session when the learner has none and then reads it from the server", async () => {
		mocks.postPageAction.mockResolvedValueOnce({ type: "success", data: { sessionId: 31 } });
		const session = start(surfaceProps());

		expect(session.isInitializing).toBe(true);
		await settle();

		expect(mocks.postPageAction).toHaveBeenCalledWith("start");
		expect(session.sessionId).toBe(31);
		expect(mocks.invalidate).toHaveBeenCalledWith("app:practice-session");
		expect(session.agentName).toBe("Maya");
	});

	it("shows a sent message at once and hands over to the server copy once it arrives", async () => {
		const props = surfaceProps({ session: persistedSession([]) });
		const session = start(props);
		mocks.sendMessage.mockResolvedValue({ status: "pending" });

		const sending = session.send("  hello\r\nthere  ");
		flushSync();
		expect(texts(session)).toEqual(["hello\nthere"]);
		expect(session.disabled).toBe(true);
		expect(await sending).toBe(true);

		const clientMessageId = mocks.sendMessage.mock.calls[0][2];
		expect(mocks.sendMessage).toHaveBeenCalledWith(11, "hello\nthere", clientMessageId, undefined);
		expect(texts(session)).toEqual(["hello\nthere", "(pending)"]);
		expect(session.isTyping).toBe(true);

		props.session = persistedSession([persisted(1, "user", "hello\nthere", { clientMessageId })]);
		flushSync();
		expect(session.messages.map((message) => message.id)).toEqual(["1", "retry-1"]);
	});

	it("gives the draft back when the server rejects a message", async () => {
		const session = start(surfaceProps({ session: persistedSession([]) }));
		mocks.sendMessage.mockResolvedValue({ status: "rejected" });

		expect(await session.send("hello")).toBe(false);
		expect(session.messages).toEqual([]);
	});

	it("hides a failed reply while its retry is in flight and resends the original text and target", async () => {
		const thread = { commentId: "reddit-user-c1", targetCommentId: "opening-0", responderName: "OP" };
		const props = surfaceProps({ session: persistedSession([persisted(1, "user", "Original", { clientMessageId: "c1", failed: true, thread })]) });
		const session = start(props);
		expect(session.isWaitingRetry).toBe(true);
		expect(session.disabled).toBe(true);
		let resolve!: (value: unknown) => void;
		mocks.sendMessage.mockReturnValue(new Promise((done) => (resolve = done)));

		const retrying = session.retry("retry-1");
		flushSync();
		expect(session.messages.some((message) => message.deliveryState === "failed")).toBe(false);
		resolve({ status: "pending" });
		await retrying;

		expect(mocks.sendMessage).toHaveBeenCalledWith(11, "Original", "c1", { threadTargetCommentId: "opening-0" });
		expect(mocks.invalidate).toHaveBeenCalled();
	});

	it("reveals a burst of new replies one at a time at typing pace, but never replays history", () => {
		const props = surfaceProps({ session: persistedSession([persisted(1, "assistant", "earlier")]) });
		const session = start(props);

		props.session = persistedSession([
			persisted(1, "assistant", "earlier"),
			persisted(2, "assistant", "one"),
			persisted(3, "assistant", "two"),
			persisted(4, "assistant", "three"),
		]);
		flushSync();
		expect(texts(session)).toEqual(["earlier", "one"]);
		expect(session.hasPendingReveals).toBe(true);

		// An identical poll must not restart the pacing.
		vi.advanceTimersByTime(getDeliveryDelayMs("two") - 1);
		props.session = persistedSession([...props.session.messages]);
		flushSync();
		vi.advanceTimersByTime(1);
		flushSync();
		expect(texts(session)).toEqual(["earlier", "one", "two"]);

		vi.advanceTimersByTime(getDeliveryDelayMs("three"));
		flushSync();
		expect(texts(session)).toEqual(["earlier", "one", "two", "three"]);
		expect(session.hasPendingReveals).toBe(false);
	});

	it("polls while a reply is pending and wakes once for far-future agent work", () => {
		const props = surfaceProps({ session: persistedSession([persisted(1, "user", "hi", { clientMessageId: "c1" })]) });
		start(props);
		vi.advanceTimersByTime(3_000);
		expect(mocks.invalidate).toHaveBeenCalledTimes(1);

		props.session = persistedSession([persisted(1, "user", "hi", { clientMessageId: "c1" }), persisted(2, "assistant", "hey")], {
			nextAgentWorkDueAt: "2026-09-25T10:30:00Z",
		});
		flushSync();
		mocks.invalidate.mockClear();
		vi.advanceTimersByTime(30 * 60_000);
		expect(mocks.invalidate).not.toHaveBeenCalled();
		vi.advanceTimersByTime(30 * 60_000 + 2_000);
		expect(mocks.invalidate).toHaveBeenCalledTimes(1);
	});

	it("finishes after confirmation and opens the feedback page under the base path", async () => {
		const session = start(surfaceProps({ session: persistedSession([persisted(1, "user", "hi"), persisted(2, "assistant", "hey")]) }));

		session.requestFinish();
		expect(session.confirmingFinish).toBe(true);
		await session.finish();

		expect(mocks.postPageAction).toHaveBeenCalledWith("complete", { sessionId: 11 });
		expect(mocks.goto).toHaveBeenCalledWith("/libiamo/task/5/feedback");
		expect(session.isCompleted).toBe(true);
	});

	it("needs a sent turn before finishing and treats an already finished session as finished", async () => {
		const empty = start(surfaceProps({ session: persistedSession([]) }));
		empty.requestFinish();
		expect(empty.confirmingFinish).toBe(false);
		cleanup?.();

		const session = start(surfaceProps({ session: persistedSession([persisted(1, "user", "hi")]) }));
		mocks.postPageAction.mockResolvedValueOnce({ type: "failure", status: 409, data: { error: "Session not in progress" } });
		await session.finish();
		expect(mocks.goto).toHaveBeenCalledWith("/libiamo/task/5/feedback");
	});

	it("finishes by itself when a loaded session is already at its turn limit", async () => {
		start(surfaceProps({ maxTurns: 1, session: persistedSession([persisted(1, "user", "hi"), persisted(2, "assistant", "bye")]) }));
		await settle();

		expect(mocks.postPageAction).toHaveBeenCalledWith("complete", { sessionId: 11 });
	});

	it("navigates to feedback when the send itself completed the session", async () => {
		const session = start(surfaceProps({ maxTurns: 2, session: persistedSession([persisted(1, "user", "hi"), persisted(2, "assistant", "hey")]) }));
		mocks.sendMessage.mockResolvedValue({ status: "session_completed" });

		await session.send("bye");

		expect(mocks.goto).toHaveBeenCalledWith("/libiamo/task/5/feedback");
		expect(mocks.postPageAction).not.toHaveBeenCalledWith("complete", expect.anything());
	});

	it("reads a completed session as read-only", () => {
		const session = start(surfaceProps({ session: persistedSession([persisted(1, "user", "hi")], { status: "evaluated" }) }));

		expect(session.isCompleted).toBe(true);
		expect(session.disabled).toBe(true);
		expect(session.canFinish).toBe(false);
	});
});
