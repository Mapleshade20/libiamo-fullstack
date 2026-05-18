import { onMount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPracticeSession, type PracticeSessionOptions, resolveAgentName } from "$lib/components/practice-ui/session.svelte";

const mocks = vi.hoisted(() => ({
	tick: vi.fn(async () => { }),
	invalidateAll: vi.fn(async () => { }),
	postAction: vi.fn(),
	attemptAgentReply: vi.fn(),
	initUserPool: vi.fn(),
}));

vi.mock("svelte", () => ({
	onMount: vi.fn(),
	tick: mocks.tick,
}));

vi.mock("$app/navigation", () => ({
	invalidateAll: mocks.invalidateAll,
}));

vi.mock("$lib/components/practice-ui/apiService", () => ({
	postAction: mocks.postAction,
}));

vi.mock("$lib/components/practice-ui/chatFlowController", () => ({
	attemptAgentReply: mocks.attemptAgentReply,
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
		agentStartsFirst: true,
		labels: {
			stillProcessingMessage: "Still processing...",
			retryFailedMessage: "Reply failed. Retry.",
			earlier: "Earlier",
		},
		joinTriggerText: "*Session started*",
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

describe("createPracticeSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(onMount).mockImplementation(() => { });
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

	it("sends user message and appends agent reply", async () => {
		mocks.attemptAgentReply.mockResolvedValue({
			status: "reply",
			text: "Great reply",
			terminated: false,
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

		expect(mocks.attemptAgentReply).toHaveBeenCalledWith(202, "Hello there", expect.any(String), {}, undefined);
		expect(session.messages.some((message) => message.role === "user" && message.text === "Hello there")).toBe(true);
		expect(session.messages.some((message) => message.role === "agent" && message.text === "Great reply")).toBe(true);
		expect(mocks.invalidateAll).toHaveBeenCalled();
	});

	it("retries failed placeholder with persisted retry text", async () => {
		mocks.attemptAgentReply.mockResolvedValue({
			status: "reply",
			text: "Recovered response",
			terminated: false,
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

		expect(mocks.attemptAgentReply).toHaveBeenCalledWith(303, "Original learner message", "msg-5", {});
		expect(session.messages.find((message) => message.id === failedMessage?.id)?.isHidden).toBe(true);
		expect(session.messages.some((message) => message.role === "agent" && message.text === "Recovered response")).toBe(true);
	});

	it("retries AO3 replies with their original target comment id", async () => {
		mocks.attemptAgentReply.mockResolvedValue({
			status: "reply",
			text: "Recovered AO3 response",
			terminated: false,
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
						ao3: { commentId: "ao3-user-ao3-msg-6", targetCommentId: "c1", responderName: "ReaderA", mode: "reply" },
					},
				},
			],
		};
		const session = createSession(createOptions({ existingSession }));

		session.hydrateFromExistingSession(existingSession);
		await waitForPromises();

		const failedMessage = session.messages.find((message) => message.deliveryState === "failed");
		await session.handleRetry(failedMessage?.id ?? "");

		expect(mocks.attemptAgentReply).toHaveBeenCalledWith(304, "Original AO3 reply", "ao3-msg-6", { ao3TargetCommentId: "c1" });
	});

	it("starts a fresh session and sends hidden join trigger when agent starts first", async () => {
		mocks.postAction.mockResolvedValue({
			type: "success",
			data: { sessionId: 404 },
		});
		mocks.attemptAgentReply.mockResolvedValue({
			status: "pending",
		});
		const joinTriggerText = "*Session started*";
		const session = createSession(
			createOptions({
				existingSession: null,
				agentStartsFirst: true,
				joinTriggerText,
			}),
		);

		await session.initializeFreshSession();
		await waitForPromises();

		expect(mocks.postAction).toHaveBeenCalledWith("start", null);
		expect(mocks.attemptAgentReply).toHaveBeenCalledWith(404, joinTriggerText, "join-404");
		expect(session.messages.some((message) => message.isHidden && message.text === joinTriggerText)).toBe(true);
		expect(session.messages.some((message) => message.deliveryState === "pending")).toBe(true);
	});

	it("adds failed placeholder and retry text when send attempt fails", async () => {
		mocks.attemptAgentReply.mockResolvedValue({
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
		mocks.attemptAgentReply.mockResolvedValue({
			status: "rejected",
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
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
		mocks.postAction.mockResolvedValue({
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
				agentStartsFirst: true,
			}),
		);

		session.hydrateFromExistingSession(existingSession);
		session.runAutoCompleteIfNeeded();
		await waitForPromises();

		expect(mocks.postAction).toHaveBeenCalledWith("complete", 505);
		expect(session.isCompleted).toBe(true);
		expect(session.showEvaluationModal).toBe(true);
	});

	it("handles complete failures without leaving loading state", async () => {
		mocks.postAction.mockRejectedValue(new Error("complete error"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
		const existingSession = {
			id: 701,
			status: "in_progress",
			tutorFeedback: null,
			messages: [],
		};
		const session = createSession(createOptions({ existingSession }));
		session.hydrateFromExistingSession(existingSession);

		await session.handleComplete();

		expect(errorSpy).toHaveBeenCalledWith("Completion failed:", expect.any(Error));
		expect(session.isCompleting).toBe(false);
	});

	it("hydrates using sorted messages and custom hidden check", async () => {
		const existingSession = {
			id: 702,
			status: "in_progress",
			tutorFeedback: null,
			messages: [
				{ id: 9, role: "assistant", content: "new", createdAt: "2026-05-18T02:00:00.000Z" },
				{ id: 8, role: "assistant", content: "legacy hidden marker", createdAt: "2026-05-18T01:00:00.000Z" },
			],
		};
		const session = createSession(
			createOptions({
				existingSession,
				isHiddenCheck: (message) => message.content.includes("hidden marker"),
			}),
		);

		session.hydrateFromExistingSession(existingSession);
		await waitForPromises();

		const mapped = session.messages.filter((message) => message.role === "agent");
		expect(mapped[0]?.text).toBe("legacy hidden marker");
		expect(mapped[0]?.isHidden).toBe(true);
		expect(mapped[1]?.text).toBe("new");
	});

	it("initializes without agent-first reply when agentStartsFirst is false", async () => {
		mocks.postAction.mockResolvedValue({
			type: "success",
			data: { sessionId: 703 },
		});
		const session = createSession(
			createOptions({
				existingSession: null,
				agentStartsFirst: false,
			}),
		);

		await session.initializeFreshSession();

		expect(mocks.attemptAgentReply).not.toHaveBeenCalled();
		expect(session.messages.some((message) => message.isHidden)).toBe(false);
	});

	it("handles initialization failure and resets initializing state", async () => {
		mocks.postAction.mockRejectedValue(new Error("start error"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
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
		expect(session.feedback).toBeNull();
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
		session.showEvaluationModal = true;
		expect(session.showEvaluationModal).toBe(true);
		session.isEntering = false;
		expect(session.isEntering).toBe(false);
	});
});
