import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPracticeSession, type PracticeSessionOptions, resolveAgentName } from "$lib/components/practice-ui/session.svelte";

const mocks = vi.hoisted(() => ({
	tick: vi.fn(async () => {}),
	invalidateAll: vi.fn(async () => {}),
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

		expect(mocks.attemptAgentReply).toHaveBeenCalledWith(202, "Hello there", expect.any(String));
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

		expect(mocks.attemptAgentReply).toHaveBeenCalledWith(303, "Original learner message", "msg-5");
		expect(session.messages.find((message) => message.id === failedMessage?.id)?.isHidden).toBe(true);
		expect(session.messages.some((message) => message.role === "agent" && message.text === "Recovered response")).toBe(true);
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
});
