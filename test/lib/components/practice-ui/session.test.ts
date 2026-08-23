import { onMount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeliveryDelayMs } from "$lib/agent-replies/timing";
import {
	AGENT_WORK_DUE_SOON_MS,
	AGENT_WORK_WAKE_BUFFER_MS,
	createPracticeSession,
	type PracticeSessionOptions,
	planAgentWorkPolling,
	resolveAgentName,
} from "$lib/components/practice-ui/session.svelte";
import { TRIAL_QUOTA_DEPENDENCY } from "$lib/load-dependencies";

const mocks = vi.hoisted(() => ({
	tick: vi.fn(async () => {}),
	invalidate: vi.fn(async () => {}),
	postAction: vi.fn(),
	completeAction: vi.fn(),
	submitPracticeMessage: vi.fn(),
	initUserPool: vi.fn(),
}));

vi.mock("svelte", () => ({
	onMount: vi.fn(),
	tick: mocks.tick,
}));

vi.mock("$app/navigation", () => ({
	invalidate: mocks.invalidate,
}));

vi.mock("$lib/components/practice-ui/apiService", () => ({
	postAction: mocks.postAction,
	completeAction: mocks.completeAction,
}));

vi.mock("$lib/components/practice-ui/chatFlowController", () => ({
	submitPracticeMessage: mocks.submitPracticeMessage,
}));

vi.mock("$lib/components/practice-ui/discord/userPool", () => ({
	initUserPool: mocks.initUserPool,
}));

function createOptions(overrides: Partial<PracticeSessionOptions> = {}): PracticeSessionOptions {
	return {
		userName: "Learner",
		avatarUrl: "/avatar.png",
		language: "en",
		existingSession: null,
		openingState: {},
		maxTurns: 0,
		labels: {
			stillProcessingMessage: "Still processing...",
			retryFailedMessage: "Reply failed. Retry.",
			earlier: "Earlier",
		},
		...overrides,
	};
}

async function waitForPromises(times = 8) {
	for (let index = 0; index < times; index += 1) {
		await Promise.resolve();
	}
}

function createSession(options: PracticeSessionOptions) {
	return createPracticeSession(() => options);
}

describe("resolveAgentName", () => {
	it("returns first non-user sender from opening history", () => {
		const name = resolveAgentName(
			{
				previousMessages: [
					{ sender: "Learner", text: "hey" },
					{ sender: "Roddy", text: "hello" },
				],
			} as any,
			"Learner",
			"Agent",
		);

		expect(name).toBe("Roddy");
	});

	it("skips user-authored opening messages and reads author fallback", () => {
		const name = resolveAgentName(
			{
				previousMessages: [
					{ sender: "Learner", text: "self" },
					{ author: "Maya", text: "from author field" },
				],
			} as any,
			"Learner",
			"Agent",
		);

		expect(name).toBe("Maya");
	});

	it("falls back when opening messages are malformed", () => {
		const name = resolveAgentName(
			{
				previousMessages: "invalid" as any,
			},
			"Learner",
			"Agent",
		);

		expect(name).toBe("Agent");
	});
});

describe("planAgentWorkPolling", () => {
	const now = new Date("2026-08-23T12:00:00.000Z");

	it("polls continuously while a placeholder is pending even without scheduled work", () => {
		expect(planAgentWorkPolling({ hasPendingPlaceholder: true, agentWorkDueAt: null, now })).toEqual({ kind: "interval" });
	});

	it("polls while agent work is due within the horizon", () => {
		expect(planAgentWorkPolling({ hasPendingPlaceholder: false, agentWorkDueAt: new Date(now.getTime() + AGENT_WORK_DUE_SOON_MS), now })).toEqual({
			kind: "interval",
		});
	});

	it("wakes once when the next agent work is far in the future", () => {
		const dueAt = new Date(now.getTime() + 10 * 60_000);
		expect(planAgentWorkPolling({ hasPendingPlaceholder: false, agentWorkDueAt: dueAt, now })).toEqual({
			kind: "wake",
			delayMs: 10 * 60_000 + AGENT_WORK_WAKE_BUFFER_MS,
		});
	});

	it("stops watching when no agent work is outstanding", () => {
		expect(planAgentWorkPolling({ hasPendingPlaceholder: false, agentWorkDueAt: null, now })).toEqual({ kind: "none" });
	});
});

describe("createPracticeSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(onMount).mockImplementation(() => {});
		mocks.initUserPool.mockReturnValue({
			agentUser: {
				id: "agent",
				name: "Roddy",
				status: "Online",
				color: "bg-purple",
				isAgent: true,
			},
		});
	});

	it("hydrates state from existing session and pool", async () => {
		const onPoolInit = vi.fn();
		const existingSession = {
			id: 101,
			status: "in_progress",
			tutorFeedback: null,
			messages: [{ id: 1, role: "assistant", content: "Hello", createdAt: "2026-05-18T00:00:00.000Z" }],
		};
		const session = createSession(
			createOptions({
				existingSession,
				openingState: { previousMessages: [{ sender: "Roddy", text: "Earlier message" }] },
				onPoolInit,
			}),
		);

		session.hydrateFromExistingSession(existingSession);
		await waitForPromises();

		expect(session.sessionId).toBe(101);
		expect(session.agentUser.name).toBe("Roddy");
		expect(onPoolInit).toHaveBeenCalledTimes(1);
		expect(session.messages.length).toBeGreaterThan(0);
	});

	it("shows existing completed feedback and scrolls hydrated messages", async () => {
		const chatContainer = { scrollTop: 0, scrollHeight: 240 };
		const existingSession = {
			id: 102,
			status: "completed",
			tutorFeedback: {
				content: "Done",
				objectiveResults: [],
			},
			messages: [{ id: 1, role: "assistant", content: "Finished", createdAt: "2026-05-18T00:00:00.000Z" }],
		};
		const session = createSession(createOptions({ existingSession }));
		session.chatContainer = chatContainer as any;

		session.hydrateFromExistingSession(existingSession);
		await waitForPromises();

		expect(session.isCompleted).toBe(true);
		expect(chatContainer.scrollTop).toBe(240);
	});

	it("paces a burst of new agent messages at typing intervals", async () => {
		vi.useFakeTimers();
		const before = {
			id: 401,
			status: "in_progress",
			tutorFeedback: null,
			messages: [
				{ id: 1, role: "user", content: "hi", createdAt: "2026-05-18T00:00:00.000Z" },
				{ id: 2, role: "assistant", content: "hello", createdAt: "2026-05-18T00:01:00.000Z" },
			],
		};
		const after = {
			...before,
			messages: [
				...before.messages,
				{ id: 3, role: "assistant", content: "msg-three", createdAt: "2026-05-18T00:02:00.000Z" },
				{ id: 4, role: "assistant", content: "msg-four", createdAt: "2026-05-18T00:03:00.000Z" },
				{ id: 5, role: "assistant", content: "msg-five", createdAt: "2026-05-18T00:04:00.000Z" },
			],
		};
		const session = createSession(createOptions({ existingSession: before }));
		session.hydrateFromExistingSession(before);
		await waitForPromises();

		session.hydrateFromExistingSession(after);
		await waitForPromises();
		// the first burst message lands immediately; the rest wait their typing turn
		expect(session.messages.map((message) => message.id)).toEqual(["1", "2", "3"]);
		expect(session.hasPendingReveals).toBe(true);

		vi.advanceTimersByTime(getDeliveryDelayMs("msg-four"));
		await waitForPromises();
		expect(session.messages.map((message) => message.id)).toEqual(["1", "2", "3", "4"]);

		vi.advanceTimersByTime(getDeliveryDelayMs("msg-five"));
		await waitForPromises();
		expect(session.messages.map((message) => message.id)).toEqual(["1", "2", "3", "4", "5"]);
		expect(session.hasPendingReveals).toBe(false);
		vi.useRealTimers();
	});

	it("shows a single newly delivered agent message immediately", async () => {
		const before = {
			id: 402,
			status: "in_progress",
			tutorFeedback: null,
			messages: [{ id: 1, role: "user", content: "hi", createdAt: "2026-05-18T00:00:00.000Z" }],
		};
		const after = {
			...before,
			messages: [...before.messages, { id: 3, role: "assistant", content: "one reply", createdAt: "2026-05-18T00:02:00.000Z" }],
		};
		const session = createSession(createOptions({ existingSession: before }));
		session.hydrateFromExistingSession(before);
		await waitForPromises();

		session.hydrateFromExistingSession(after);
		await waitForPromises();

		expect(session.messages.map((message) => message.id)).toEqual(["1", "3"]);
		expect(session.hasPendingReveals).toBe(false);
	});

	it("reveals paced messages immediately when the user sends a new message", async () => {
		vi.useFakeTimers();
		mocks.submitPracticeMessage.mockResolvedValue({ status: "pending" });
		const before = {
			id: 403,
			status: "in_progress",
			tutorFeedback: null,
			messages: [
				{ id: 1, role: "user", content: "hi", createdAt: "2026-05-18T00:00:00.000Z" },
				{ id: 2, role: "assistant", content: "hello", createdAt: "2026-05-18T00:01:00.000Z" },
			],
		};
		const after = {
			...before,
			messages: [
				...before.messages,
				{ id: 3, role: "assistant", content: "msg-three", createdAt: "2026-05-18T00:02:00.000Z" },
				{ id: 4, role: "assistant", content: "msg-four", createdAt: "2026-05-18T00:03:00.000Z" },
			],
		};
		const session = createSession(createOptions({ existingSession: before }));
		session.hydrateFromExistingSession(before);
		await waitForPromises();
		session.hydrateFromExistingSession(after);
		await waitForPromises();
		expect(session.hasPendingReveals).toBe(true);

		await session.handleSend("next message");

		expect(session.hasPendingReveals).toBe(false);
		const texts = session.messages.map((message) => message.text);
		// the optimistic user message lands after the full agent burst
		expect(texts.indexOf("msg-four")).toBeGreaterThan(-1);
		expect(texts.indexOf("msg-four")).toBeLessThan(texts.indexOf("next message"));
		vi.useRealTimers();
	});

	it("skips hydration when the server snapshot has not changed", async () => {
		const existingSession = {
			id: 103,
			status: "in_progress",
			tutorFeedback: null,
			messages: [{ id: 1, role: "assistant", content: "Hello", createdAt: "2026-05-18T00:00:00.000Z" }],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		session.hydrateFromExistingSession(existingSession);

		expect(mocks.initUserPool).toHaveBeenCalledTimes(1);
	});

	it("rehydrates when metadata changes even if message content is stable", async () => {
		const existingSession = {
			id: 104,
			status: "evaluated",
			tutorFeedback: null,
			messages: [
				{
					id: 1,
					role: "user",
					content: "Hello",
					createdAt: "2026-05-18T00:00:00.000Z",
					llmMetadata: { clientMessageId: "msg-1", failed: false, hidden: false, mailBodyHtml: 123 },
				},
			],
		};
		const updatedSession = {
			...existingSession,
			messages: [
				{
					...existingSession.messages[0],
					llmMetadata: { clientMessageId: "msg-1", failed: true, hidden: true, mailBodyHtml: "<div>Hello</div>" },
				},
			],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		session.hydrateFromExistingSession(updatedSession);

		expect(mocks.initUserPool).toHaveBeenCalledTimes(2);
		expect(session.isCompleted).toBe(true);
	});

	it("hydrates sessions without a message array", () => {
		const existingSession = {
			id: 105,
			status: null,
			tutorFeedback: null,
			messages: undefined,
		};
		const session = createSession(createOptions({ existingSession: null, timeZone: "Asia/Tokyo" }));

		session.hydrateFromExistingSession(existingSession);

		expect(session.sessionId).toBe(105);
		expect(session.messages).toEqual([]);
	});

	it("sends user message and appends the pending reply placeholder", async () => {
		mocks.submitPracticeMessage.mockResolvedValue({
			status: "pending",
		});
		const existingSession = {
			id: 202,
			status: "in_progress",
			tutorFeedback: null,
			messages: [],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await waitForPromises();
		await session.handleSend("Hello there");

		expect(mocks.submitPracticeMessage).toHaveBeenCalledWith(202, "Hello there", expect.any(String), {});
		expect(session.messages.some((message) => message.role === "user" && message.text === "Hello there")).toBe(true);
		expect(session.messages.some((message) => message.role === "agent" && message.deliveryState === "pending")).toBe(true);
		expect(mocks.invalidate).toHaveBeenCalledWith(TRIAL_QUOTA_DEPENDENCY);
	});

	it("ignores empty or disabled sends", async () => {
		const session = createSession(createOptions({ existingSession: null }));

		await session.handleSend("   ");
		await session.handleSend("hello");

		expect(mocks.submitPracticeMessage).not.toHaveBeenCalled();
	});

	it("retries failed placeholder with persisted retry text", async () => {
		mocks.submitPracticeMessage.mockResolvedValue({
			status: "pending",
		});
		const existingSession = {
			id: 303,
			status: "in_progress",
			tutorFeedback: null,
			messages: [
				{
					id: 5,
					role: "user",
					content: "Original learner message",
					createdAt: "2026-05-18T00:00:00.000Z",
					llmMetadata: { clientMessageId: "msg-5", failed: true },
				},
			],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await waitForPromises();

		const failedMessage = session.messages.find((message) => message.deliveryState === "failed");
		expect(failedMessage).toBeDefined();

		await session.handleRetry(failedMessage?.id ?? "");

		expect(mocks.submitPracticeMessage).toHaveBeenCalledWith(303, "Original learner message", "msg-5", {});
		expect(session.messages.find((message) => message.id === failedMessage?.id)?.isHidden).toBe(true);
		expect(session.messages.some((message) => message.role === "agent" && message.deliveryState === "pending")).toBe(true);
	});

	it("scrolls manually when a chat container is bound", async () => {
		const session = createSession(createOptions());
		const chatContainer = { scrollTop: 0, scrollHeight: 88 };
		session.chatContainer = chatContainer as any;

		await session.scrollToBottom();

		expect(chatContainer.scrollTop).toBe(88);
	});

	it("ignores retry when the message is missing retry metadata", async () => {
		const existingSession = {
			id: 304,
			status: "in_progress",
			tutorFeedback: null,
			messages: [{ id: 5, role: "assistant", content: "No retry", createdAt: "2026-05-18T00:00:00.000Z" }],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await session.handleRetry(session.messages[0]?.id ?? "");

		expect(mocks.submitPracticeMessage).not.toHaveBeenCalled();
	});

	it("ignores retry while completion state blocks actions", async () => {
		const existingSession = {
			id: 305,
			status: "completed",
			tutorFeedback: null,
			messages: [
				{
					id: 5,
					role: "user",
					content: "Original learner message",
					createdAt: "2026-05-18T00:00:00.000Z",
					llmMetadata: { clientMessageId: "msg-5", failed: true },
				},
			],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await session.handleRetry(session.messages.find((message) => message.deliveryState === "failed")?.id ?? "");

		expect(mocks.submitPracticeMessage).not.toHaveBeenCalled();
	});

	it("retries AO3 replies with their original target comment id", async () => {
		mocks.submitPracticeMessage.mockResolvedValue({
			status: "pending",
		});
		const existingSession = {
			id: 304,
			status: "in_progress",
			tutorFeedback: null,
			messages: [
				{
					id: 6,
					role: "user",
					content: "Prompt-only AO3 context",
					createdAt: "2026-05-18T00:00:00.000Z",
					llmMetadata: {
						clientMessageId: "ao3-msg-6",
						failed: true,
						displayContent: "Original AO3 reply",
						thread: { commentId: "ao3-user-ao3-msg-6", targetCommentId: "c1", responderName: "ReaderA", mode: "reply" },
					},
				},
			],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await waitForPromises();

		const failedMessage = session.messages.find((message) => message.deliveryState === "failed");
		await session.handleRetry(failedMessage?.id ?? "");

		expect(mocks.submitPracticeMessage).toHaveBeenCalledWith(304, "Original AO3 reply", "ao3-msg-6", { threadTargetCommentId: "c1" });
	});

	it("retries generic threaded replies with their original target comment id", async () => {
		mocks.submitPracticeMessage.mockResolvedValue({
			status: "pending",
		});
		const existingSession = {
			id: 305,
			status: "in_progress",
			tutorFeedback: null,
			messages: [
				{
					id: 7,
					role: "user",
					content: "Prompt-only Reddit context",
					createdAt: "2026-05-18T00:00:00.000Z",
					llmMetadata: {
						clientMessageId: "reddit-msg-7",
						failed: true,
						displayContent: "Original Reddit reply",
						thread: { commentId: "reddit-user-reddit-msg-7", targetCommentId: "c1", responderName: "CommenterA", mode: "reply" },
					},
				},
			],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await waitForPromises();

		const failedMessage = session.messages.find((message) => message.deliveryState === "failed");
		await session.handleRetry(failedMessage?.id ?? "");

		expect(mocks.submitPracticeMessage).toHaveBeenCalledWith(305, "Original Reddit reply", "reddit-msg-7", { threadTargetCommentId: "c1" });
	});
	it("adds failed placeholder and retry text when send attempt fails", async () => {
		mocks.submitPracticeMessage.mockResolvedValue({
			status: "failed",
		});
		const existingSession = {
			id: 606,
			status: "in_progress",
			tutorFeedback: null,
			messages: [],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await session.handleSend("Need help");

		const failed = session.messages.find((message) => message.deliveryState === "failed");
		expect(failed?.text).toBe("Reply failed. Retry.");
		expect(failed?.retryText).toBe("Need help");
	});

	it("warns and avoids agent placeholder when send is rejected", async () => {
		mocks.submitPracticeMessage.mockResolvedValue({
			status: "rejected",
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const existingSession = {
			id: 607,
			status: "in_progress",
			tutorFeedback: null,
			messages: [],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await session.handleSend("Try send");

		expect(warnSpy).toHaveBeenCalledWith("Backend rejected the message");
		expect(session.messages.some((message) => message.role === "agent" && message.clientMessageId)).toBe(false);
	});

	it("auto-completes when turn limit is reached without waiting-retry state", async () => {
		mocks.completeAction.mockResolvedValue({
			type: "success",
			data: {
				feedback: {
					content: "Great work",
					objectiveResults: [],
				},
			},
		});
		const existingSession = {
			id: 505,
			status: "in_progress",
			tutorFeedback: null,
			messages: [{ id: 77, role: "user", content: "final turn", createdAt: "2026-05-18T00:00:00.000Z" }],
		};
		const session = createSession(
			createOptions({
				existingSession,
				maxTurns: 1,
			}),
		);

		session.hydrateFromExistingSession(existingSession);
		session.runAutoCompleteIfNeeded();
		await waitForPromises();

		expect(mocks.completeAction).toHaveBeenCalledWith(505);
		expect(session.isCompleted).toBe(true);
		// Note: auto-complete now uses handleCompleteAndNavigate
	});

	it("handles complete failures without leaving loading state", async () => {
		mocks.completeAction.mockRejectedValue(new Error("complete error"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const existingSession = {
			id: 701,
			status: "in_progress",
			tutorFeedback: null,
			messages: [],
		};
		const session = createSession(createOptions({ existingSession }));
		session.hydrateFromExistingSession(existingSession);

		await session.handleCompleteAndNavigate(String(session.sessionId ?? ""));

		expect(errorSpy).toHaveBeenCalledWith("Completion failed:", expect.any(Error));
		expect(session.isCompleting).toBe(false);
	});

	it("leaves completion state unchanged when complete returns no data", async () => {
		mocks.completeAction.mockResolvedValue({
			type: "error",
		});
		const existingSession = {
			id: 705,
			status: "in_progress",
			tutorFeedback: null,
			messages: [],
		};
		const session = createSession(createOptions({ existingSession }));
		session.hydrateFromExistingSession(existingSession);

		await session.handleCompleteAndNavigate(String(session.sessionId ?? ""));

		expect(session.isCompleted).toBe(false);
		expect(session.isCompleting).toBe(false);
	});

	it("ignores complete when no active session is available", async () => {
		const session = createSession(createOptions({ existingSession: null }));

		await session.handleCompleteAndNavigate("0");

		expect(mocks.completeAction).not.toHaveBeenCalled();
	});

	it("hydrates using sorted messages and metadata-based hidden state", async () => {
		const existingSession = {
			id: 702,
			status: "in_progress",
			tutorFeedback: null,
			messages: [
				{ id: 9, role: "assistant", content: "new", createdAt: "2026-05-18T02:00:00.000Z" },
				{
					id: 8,
					role: "assistant",
					content: "legacy hidden marker",
					createdAt: "2026-05-18T01:00:00.000Z",
					llmMetadata: { hidden: true },
				},
			],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await waitForPromises();

		const mapped = session.messages.filter((message) => message.role === "agent");
		expect(mapped[0]?.text).toBe("legacy hidden marker");
		expect(mapped[0]?.isHidden).toBe(true);
		expect(mapped[1]?.text).toBe("new");
	});
	it("initializes a fresh session without requesting any agent opening", async () => {
		mocks.postAction.mockResolvedValue({
			type: "success",
			data: { sessionId: 703 },
		});
		const session = createSession(
			createOptions({
				existingSession: null,
			}),
		);

		await session.initializeFreshSession();

		expect(mocks.submitPracticeMessage).not.toHaveBeenCalled();
		expect(session.sessionId).toBe(703);
		expect(session.messages.some((message) => message.isHidden)).toBe(false);
	});

	it("leaves a fresh session uninitialized when start does not return data", async () => {
		mocks.postAction.mockResolvedValue({
			type: "error",
		});
		const session = createSession(
			createOptions({
				existingSession: null,
			}),
		);

		await session.initializeFreshSession();

		expect(session.sessionId).toBeNull();
		expect(session.isInitializing).toBe(false);
		expect(mocks.initUserPool).not.toHaveBeenCalled();
	});

	it("handles initialization failure and resets initializing state", async () => {
		mocks.postAction.mockRejectedValue(new Error("start error"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const session = createSession(
			createOptions({
				existingSession: null,
			}),
		);

		await session.initializeFreshSession();

		expect(errorSpy).toHaveBeenCalledWith("Initialization failed:", expect.any(Error));
		expect(session.isInitializing).toBe(false);
	});

	it("executes onMount setup and cleanup hooks", async () => {
		const cleanups: Array<() => void> = [];
		vi.useFakeTimers();
		vi.mocked(onMount).mockImplementation((callback: any) => {
			const cleanup = callback();
			if (typeof cleanup === "function") cleanups.push(cleanup);
		});
		const session = createSession(
			createOptions({
				existingSession: {
					id: 704,
					status: "in_progress",
					tutorFeedback: null,
					messages: [],
				},
			}),
		);

		expect(session.isEntering).toBe(true);
		vi.advanceTimersByTime(300);
		expect(session.isEntering).toBe(false);

		for (const cleanup of cleanups) cleanup();
		vi.useRealTimers();
	});

	it("exposes derived and mutable state getters/setters", () => {
		const session = createSession(createOptions());

		expect(session.sessionId).toBeNull();
		expect(session.isSubmitting).toBe(false);
		expect(session.isCompleting).toBe(false);
		expect(session.isCompleted).toBe(false);
		expect(session.inputText).toBe("");
		session.inputText = "hello";
		expect(session.inputText).toBe("hello");
		expect(session.chatContainer).toBeNull();
		session.chatContainer = { scrollTop: 0, scrollHeight: 100 } as any;
		expect(session.chatContainer?.scrollHeight).toBe(100);
		expect(session.isTyping).toBe(false);
		expect(session.remainingTurns).toBeNull();
		expect(session.disabled).toBe(true);
		expect(session.agentName).toBe("Agent");
		expect(session.openingStateData).toEqual({});
		session.isEntering = false;
		expect(session.isEntering).toBe(false);
	});
});
