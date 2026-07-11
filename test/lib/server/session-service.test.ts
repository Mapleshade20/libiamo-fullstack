import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "test-user-id";

const { mockDb, mockClient } = vi.hoisted(() => ({
	mockDb: {
		query: {
			task: { findFirst: vi.fn() },
			practiceSession: { findFirst: vi.fn() },
		},
		insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => []) })) })),
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
	},
	mockClient: {
		chatText: vi.fn(),
		chatJson: vi.fn(),
		chatTools: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/llm", () => mockClient);

import { practiceSession } from "$lib/server/db/schema";
import { completeSession, generateHint, getSessionOrFail, sendMessage, startSession } from "$lib/server/session";

function mockAgentReply(reply: string, terminated = false) {
	mockClient.chatTools.mockResolvedValue({
		content: reply,
		toolCalls: terminated ? [{ id: "call-1", name: "terminate_conversation", argumentsText: "{}", arguments: {}, raw: {} }] : [],
		raw: { id: "chatcmpl-test" },
	});
}

describe("session service", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockDb.insert.mockImplementation(() => ({
			values: vi.fn(() => ({
				returning: vi.fn().mockResolvedValue([{ id: 999 }]),
			})),
		}));
		mockDb.update.mockImplementation(() => ({
			set: vi.fn(() => ({ where: vi.fn() })),
		}));
	});

	const mockTask = {
		id: 1,
		agentPrompt: "You are a helpful assistant.",
		language: "en",
		template: {
			ui: "discord" as const,
		},
		variant: {
			openingState: {
				serverName: "Test Server",
				previousMessages: [{ sender: "Alice", text: "Hello!" }],
			},
		},
	};

	describe("startSession", () => {
		it("creates session and persists language-constrained prompt", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456", "English");

			expect(result.sessionId).toBe(123);
			expect(result.mbti).toMatch(/^(INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)$/);
			expect(result.systemPrompt).toContain("IMPORTANT: You MUST give all your conversational replies in ENGLISH");
			expect(result.systemPrompt).toContain("Scenario: Discord");
			expect(result.systemPrompt).toContain("You are a helpful assistant.");
		});

		it("falls back to MBTI-only prompt when agentPrompt is null", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				agentPrompt: null,
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456", "English");

			expect(result.systemPrompt).toContain("Scenario: Discord");
			expect(result.systemPrompt).not.toContain("You are a helpful assistant.");
		});

		it("formats Discord history with sender before text even when openingState stores text first", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				variant: {
					openingState: {
						serverName: "Amigos",
						channelName: "general",
						previousMessages: [{ text: "Sii ya lo vi", sender: "Mario" }],
					},
				},
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456", "English");

			expect(result.systemPrompt).toContain("History:\n- Mario: Sii ya lo vi");
			expect(result.systemPrompt).not.toContain("History:\n- Sii ya lo vi: Mario");
		});

		it("keeps known message fields first and appends extra opening-state fields", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "reddit" as const },
				variant: {
					openingState: {
						post: { title: "Introductions", body: "Say hello" },
						previousComments: [{ text: "Hola", author: "Mina", likes: 3, empty: "" }],
					},
				},
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456", "English");

			expect(result.systemPrompt).toContain("Existing nested comments:\n- Mina: Hola");
			expect(result.systemPrompt).not.toContain("Hola: Mina");
		});

		it("uses a generic Mail app context when there are no received emails", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const },
				variant: { openingState: { emails: [] } },
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456", "English");

			expect(result.systemPrompt).toContain("Scenario: Mail app");
		});

		it("formats multiple received emails including optional time", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const },
				variant: {
					openingState: {
						emails: [
							{ from: "maya@example.com", to: "me@example.com", subject: "Schedule", body: "Are you free?", time: "9:00 AM" },
							{ from: "daniel@example.com", to: "me@example.com", subject: "Follow-up", body: "Thanks" },
						],
					},
				},
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456", "English");

			expect(result.systemPrompt).toContain("Scenario: Received emails");
			expect(result.systemPrompt).toContain("  Time: 9:00 AM");
			expect(result.systemPrompt).toContain("Email 2:");
		});

		it("formats iMessage history with sender before text even when openingState stores text first", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "imessage" as const },
				variant: {
					openingState: {
						previousMessages: [{ text: "¿Vienes?", sender: "Ana" }],
					},
				},
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456", "English");

			expect(result.systemPrompt).toContain("Previous:\n- Ana: ¿Vienes?");
			expect(result.systemPrompt).not.toContain("Previous:\n- ¿Vienes?: Ana");
		});

		it.each([
			{
				name: "reddit",
				ui: "reddit" as const,
				openingState: { post: { title: "Test Post", body: "Body" } },
				requiredText: "Scenario: Reddit post",
			},
			{
				name: "apple_mail",
				ui: "apple_mail" as const,
				openingState: { emails: [{ from: "boss@company.com", to: "user@example.com", subject: "Meeting", body: "See you" }] },
				requiredText: "Scenario: Received email",
			},
			{
				name: "imessage",
				ui: "imessage" as const,
				openingState: { previousMessages: [{ sender: "Alice", text: "Hey!" }] },
				requiredText: "Scenario: iMessage conversation",
			},
			{
				name: "ao3",
				ui: "ao3" as const,
				openingState: { workTitle: "My Fanfic" },
				requiredText: "Scenario: AO3 work page comment thread",
			},
			{
				name: "translator_with_text",
				ui: "translator" as const,
				openingState: { sourceText: "Bonjour" },
				requiredText: "Text to translate: Bonjour",
			},
			{
				name: "translator_empty",
				ui: "translator" as const,
				openingState: { sourceText: "" },
				requiredText: "Translation task",
			},
		])("builds a valid scenario context for $name", async ({ ui, openingState, requiredText }) => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui },
				variant: { openingState },
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456", "English");
			expect(result.systemPrompt).toContain(requiredText);
		});

		it("handles unknown UI by continuing without scenario-specific context", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "unknown_ui" as any },
				variant: { openingState: { someData: "test" } },
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456", "English");
			expect(result.sessionId).toBe(123);
			expect(result.systemPrompt).toContain("You are a helpful assistant.");
		});

		it.each([
			{ name: "task missing", taskValue: null },
			{ name: "variant missing", taskValue: { ...mockTask, variant: null } },
			{ name: "template missing", taskValue: { ...mockTask, template: null } },
		])("throws Task not found when $name", async ({ taskValue }) => {
			mockDb.query.task.findFirst.mockResolvedValue(taskValue);
			await expect(startSession(1, "user_456", "English")).rejects.toThrow("Task not found");
		});

		it("throws when session creation fails", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) });

			await expect(startSession(1, "user_456", "English")).rejects.toThrow("Failed to create session");
		});

		it("returns existing session when one already exists", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 999,
				agentPromptSnapshot: { systemPrompt: "Cached prompt", mbti: "INTJ" },
			});

			const result = await startSession(1, "user_456", "English");

			expect(result.sessionId).toBe(999);
			expect(result.systemPrompt).toBe("Cached prompt");
			expect(result.mbti).toBe("INTJ");
		});

		it("recovers from race condition when raced session exists", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(null);
			const returningMock = vi.fn().mockRejectedValue(new Error("duplicate key"));
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce({
				id: 888,
				agentPromptSnapshot: { systemPrompt: "Raced prompt", mbti: "ENFP" },
			});

			const result = await startSession(1, "user_456", "English");

			expect(result.sessionId).toBe(888);
			expect(result.systemPrompt).toBe("Raced prompt");
			expect(result.mbti).toBe("ENFP");
		});

		it("rethrows when race recovery finds no session", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(null);
			const returningMock = vi.fn().mockRejectedValue(new Error("Failed to create session"));
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(null);

			await expect(startSession(1, "user_456", "English")).rejects.toThrow("Failed to create session");
		});

		it("throws generic error when race recovery fails", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(null);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(new Error("DB down")) }) });
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(null);

			await expect(startSession(1, "user_456", "English")).rejects.toThrow("Failed to create session");
		});
	});

	describe("sendMessage", () => {
		const mockSession = {
			id: 123,
			status: "in_progress",
			agentPromptSnapshot: { systemPrompt: "Your MBTI type is ENFP." },
			messages: [],
		};

		it("sends message and returns AI reply", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);

			mockAgentReply("Hello back!");
			const result = await sendMessage(123, "Hello!", USER_ID);

			expect(result.reply).toBe("Hello back!");
			expect(result.turnCount).toBe(1);
			expect(result.terminated).toBe(false);

			expect(mockClient.chatTools).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: expect.arrayContaining([
						expect.objectContaining({ role: "system", content: expect.stringContaining("Reply in natural plain text only") }),
						expect.objectContaining({ role: "user", content: "Hello!" }),
					]),
					tools: expect.arrayContaining([expect.objectContaining({ type: "function" })]),
					userId: USER_ID,
				}),
			);
		});

		it("includes previous messages in history", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [
					{ role: "user", content: "First message" },
					{ role: "assistant", content: "First reply" },
				],
			});

			mockAgentReply("Second reply");
			await sendMessage(123, "Second message", USER_ID);

			expect(mockClient.chatTools).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: expect.arrayContaining([
						expect.objectContaining({ role: "system" }),
						expect.objectContaining({ role: "user", content: "First message" }),
						expect.objectContaining({ role: "assistant", content: "First reply" }),
						expect.objectContaining({ role: "user", content: "Second message" }),
					]),
					tools: expect.any(Array),
					userId: USER_ID,
				}),
			);
		});

		it("throws when session not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			await expect(sendMessage(999, "Hello", USER_ID)).rejects.toThrow("Session not found");
		});

		it("throws when session not in progress", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				status: "completed",
			});

			await expect(sendMessage(123, "Hello", USER_ID)).rejects.toThrow("Session not in progress");
		});

		it("throws when userMessage is empty", async () => {
			await expect(sendMessage(123, "", USER_ID)).rejects.toThrow("userMessage is required");
			await expect(sendMessage(123, "   ", USER_ID)).rejects.toThrow("userMessage is required");
		});

		it("calculates turn count correctly", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [
					{ role: "user", content: "1" },
					{ role: "assistant", content: "a" },
					{ role: "user", content: "2" },
					{ role: "assistant", content: "b" },
				],
			});

			mockAgentReply("c");
			const result = await sendMessage(123, "3", USER_ID);

			expect(result.turnCount).toBe(3);
		});

		it("returns existing assistant reply for duplicate clientMessageId", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [
					{ id: 1, role: "user", content: "Hello!", llmMetadata: { clientMessageId: "msg-1", failed: false } },
					{ id: 2, role: "assistant", content: "Hello back!", llmMetadata: { raw: { terminate: true } } },
				],
			});

			const result = await sendMessage(123, "Hello!", USER_ID, "msg-1");

			expect(result).toEqual({ reply: "Hello back!", turnCount: 1, terminated: true });
			expect(mockClient.chatTools).not.toHaveBeenCalled();
		});

		it("does not treat a later turn's assistant reply as the duplicate clientMessageId reply", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [
					{ id: 1, role: "user", content: "Hello!", llmMetadata: { clientMessageId: "msg-1", failed: false } },
					{ id: 2, role: "user", content: "Different turn", llmMetadata: { clientMessageId: "msg-2", failed: false } },
					{ id: 3, role: "assistant", content: "Reply to different turn", llmMetadata: { raw: { terminate: false } } },
				],
			});

			const result = await sendMessage(123, "Hello!", USER_ID, "msg-1");

			expect(result).toEqual({ reply: "", turnCount: 2, pending: true });
			expect(mockClient.chatTools).not.toHaveBeenCalled();
		});

		it("returns pending for duplicate clientMessageId while assistant reply is still processing", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [{ id: 1, role: "user", content: "Hello!", llmMetadata: { clientMessageId: "msg-1", failed: false } }],
			});

			const result = await sendMessage(123, "Hello!", USER_ID, "msg-1");

			expect(result).toEqual({ reply: "", turnCount: 1, pending: true });
			expect(mockClient.chatTools).not.toHaveBeenCalled();
		});

		it("retries failed generation without inserting a duplicate user message", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [{ id: 1, role: "user", content: "Hello!", llmMetadata: { clientMessageId: "msg-1", failed: true } }],
			});
			mockAgentReply("Recovered");

			const result = await sendMessage(123, "Hello!", USER_ID, "msg-1");

			expect(result).toEqual({ reply: "Recovered", turnCount: 1, terminated: false });
			expect(mockDb.update).toHaveBeenCalled();
			expect(mockDb.insert).toHaveBeenCalledTimes(1);
		});

		it("uses function calling to mark a conversation terminated", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockAgentReply("Goodbye!", true);

			const result = await sendMessage(123, "bye", USER_ID);

			expect(result).toEqual({ reply: "Goodbye!", turnCount: 1, terminated: true });
			expect(mockClient.chatTools).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: expect.arrayContaining([expect.objectContaining({ role: "system", content: expect.not.stringContaining("valid JSON") })]),
					tools: expect.arrayContaining([expect.objectContaining({ function: expect.objectContaining({ name: "terminate_conversation" }) })]),
					userId: USER_ID,
				}),
			);
		});

		it("does not make a second LLM request when the termination tool call has no content", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.chatTools.mockResolvedValue({
				content: "",
				toolCalls: [{ id: "call-1", name: "terminate_conversation", argumentsText: "{}", arguments: {}, raw: {} }],
				raw: { id: "tool-only" },
			});

			const result = await sendMessage(123, "bye", USER_ID);

			expect(result).toEqual({ reply: "I’m going to end this conversation here.", turnCount: 1, terminated: true });
			expect(mockClient.chatText).not.toHaveBeenCalled();
		});
	});

	describe("completeSession", () => {
		const mockSession = {
			id: 123,
			status: "in_progress",
			taskId: 1,
			userId: USER_ID,
		};

		const mockTaskObjectives = {
			id: 1,
			language: "en",
			objectives: ["Use polite language", "Respond appropriately"],
		};

		it("marks session as completed and returns feedback", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(mockSession).mockResolvedValueOnce({
				...mockSession,
				agentPromptSnapshot: { systemPrompt: "Scenario: Reddit post\nTitle: Test\n\nPrompt", mbti: "ENFP", ui: "reddit" },
				messages: [
					{ role: "user", content: "Hello", llmMetadata: { mailBodyHtml: '<div style="text-align: center">Hello</div>' } },
					{ role: "assistant", content: "Hi there" },
				],
				task: mockTaskObjectives,
			});
			const whereMock = vi.fn();
			mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: whereMock }) });

			mockClient.chatJson.mockResolvedValue({
				summary: "Good job!",
				grammar: [],
				vocabulary: [],
				coherence: [],
				objectiveResults: [
					{ text: "Use polite language", grade: "A" },
					{ text: "Respond appropriately", grade: "B" },
				],
			});

			await completeSession(123);

			// Verify session was marked as completed
			expect(mockDb.update).toHaveBeenCalledWith(practiceSession);
			expect(mockDb.update().set).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "completed",
					completedAt: expect.any(Date),
				}),
			);
		});

		it("marks session as completed for mail tasks", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				agentPromptSnapshot: { systemPrompt: "Mail prompt", mbti: "ENFP", ui: "apple_mail", scenarioContext: "Scenario: Received email" },
				messages: [
					{
						role: "assistant",
						content: "Please send an update.",
					},
					{
						role: "user",
						content: "To: Maya\nSubject: Update\n\nHello Maya,\nI finished the draft.",
						llmMetadata: { mailBodyHtml: "<div>Hello Maya,</div><div>I finished the draft.</div>" },
					},
					{
						role: "assistant",
						content: "Could you include next steps?",
					},
					{
						role: "user",
						content: "To: Maya\nSubject: Re: Update\n\nI will send the final version tomorrow.",
					},
				],
				task: mockTaskObjectives,
			});

			await completeSession(123);

			// Verify session was marked as completed
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("handles empty objectives", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(mockSession).mockResolvedValueOnce({
				...mockSession,
				agentPromptSnapshot: { systemPrompt: "Scenario: Test\n\nPrompt", mbti: "ENFP", ui: "discord" },
				messages: [],
				task: { ...mockTaskObjectives, objectives: [] },
			});
			const whereMock = vi.fn();
			mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: whereMock }) });

			mockClient.chatJson.mockResolvedValue({
				summary: "General fluency assessment here.",
				grammar: [],
				vocabulary: [],
				coherence: [],
				objectiveResults: [],
			});

			await completeSession(123);

			// Verify session was marked as completed
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("throws when session not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			await expect(completeSession(999)).rejects.toThrow("Session not found");
		});

		it("throws when session not in progress", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				status: "completed",
			});

			await expect(completeSession(123)).rejects.toThrow("Session not in progress");
		});

		it("throws when session already evaluated", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				status: "evaluated",
			});

			await expect(completeSession(123)).rejects.toThrow("Session not in progress");
		});
	});

	describe("message persistence", () => {
		const mockSession = {
			id: 123,
			status: "in_progress",
			agentPromptSnapshot: { systemPrompt: "Test prompt." },
			messages: [],
		};

		it("saves both user and assistant messages", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockAgentReply("AI reply");
			const valuesMock = vi
				.fn()
				.mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })
				.mockReturnValueOnce(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "User message", USER_ID);

			expect(valuesMock).toHaveBeenCalledTimes(2);
			expect(valuesMock).toHaveBeenNthCalledWith(1, { sessionId: 123, role: "user", content: "User message", llmMetadata: undefined });
			expect(valuesMock).toHaveBeenNthCalledWith(2, {
				sessionId: 123,
				role: "assistant",
				content: "AI reply",
				llmMetadata: {
					model: "tool-calling",
					raw: expect.objectContaining({ terminated: false, toolCalls: [] }),
				},
			});
		});

		it("persists user message before requesting LLM output", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockAgentReply("AI reply");
			const valuesMock = vi
				.fn()
				.mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })
				.mockReturnValueOnce(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "Ordering check", USER_ID);

			expect(valuesMock).toHaveBeenNthCalledWith(1, {
				sessionId: 123,
				role: "user",
				content: "Ordering check",
				llmMetadata: undefined,
			});
			expect(valuesMock.mock.invocationCallOrder[0]).toBeLessThan(mockClient.chatTools.mock.invocationCallOrder[0]);
		});

		it("trims user message before saving", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockAgentReply("reply");
			const valuesMock = vi
				.fn()
				.mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })
				.mockReturnValueOnce(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "  Hello  ", USER_ID);

			expect(valuesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ content: "Hello" }));
		});

		it("persists prompt content with display metadata for AO3-style turns", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockAgentReply("Author reply");
			const valuesMock = vi
				.fn()
				.mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })
				.mockReturnValueOnce(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "Visible comment", USER_ID, "ao3-1", {
				promptContent: "Prompt context plus visible comment",
				userDisplayContent: "Visible comment",
				userMetadata: { thread: { commentId: "ao3-user-ao3-1" } },
				assistantAuthorName: "FicAuthor",
				assistantMetadata: { thread: { commentId: "ao3-agent-ao3-1", parentCommentId: "ao3-user-ao3-1" } },
			});

			expect(valuesMock).toHaveBeenNthCalledWith(1, {
				sessionId: 123,
				role: "user",
				content: "Prompt context plus visible comment",
				llmMetadata: expect.objectContaining({
					clientMessageId: "ao3-1",
					displayContent: "Visible comment",
					thread: { commentId: "ao3-user-ao3-1" },
				}),
			});
			expect(valuesMock).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({
					role: "assistant",
					content: "Author reply",
					llmMetadata: expect.objectContaining({
						assistantAuthorName: "FicAuthor",
						thread: { commentId: "ao3-agent-ao3-1", parentCommentId: "ao3-user-ao3-1" },
					}),
				}),
			);
			expect(mockClient.chatTools).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: expect.arrayContaining([expect.objectContaining({ role: "user", content: "Prompt context plus visible comment" })]),
					tools: expect.any(Array),
					userId: USER_ID,
				}),
			);
		});

		it("persists user message even when LLM generation fails", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.chatTools.mockRejectedValue(new Error("LLM timeout"));
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) });
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await expect(sendMessage(123, "Need a reply", USER_ID)).rejects.toThrow("LLM timeout");

			expect(valuesMock).toHaveBeenCalledTimes(1);
			expect(valuesMock).toHaveBeenCalledWith({
				sessionId: 123,
				role: "user",
				content: "Need a reply",
				llmMetadata: undefined,
			});
		});

		it("marks failed clientMessageId metadata when LLM generation fails", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.chatTools.mockRejectedValue(new Error("LLM timeout"));
			const valuesMock = vi
				.fn()
				.mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1, llmMetadata: { clientMessageId: "msg-1", failed: false } }]) });
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await expect(sendMessage(123, "Need a reply", USER_ID, "msg-1")).rejects.toThrow("LLM timeout");

			expect(mockDb.update).toHaveBeenCalled();
		});
	});

	describe("generateHint", () => {
		it("generates hints based on session history and language", async () => {
			const mockSession = {
				id: 123,
				userId: USER_ID,
				task: { language: "ja" },
				agentPromptSnapshot: { systemPrompt: "Context" },
				messages: [{ role: "user", content: "Hello" }],
			};

			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.chatJson.mockResolvedValue({ contentHint: "背景をもう少し説明する。" });

			const result = await generateHint(123, { mode: "content", nativeLanguage: "ja" });

			expect(result).toEqual({ contentHint: "背景をもう少し説明する。" });
			expect(mockClient.chatJson).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({
					messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining("Japanese") })]),
					userId: USER_ID,
				}),
			);
		});

		it("throws error if session is not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);
			await expect(generateHint(999, { mode: "content" })).rejects.toThrow("Session not found");
		});

		it("throws when normal hint session has no task", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({ id: 123, userId: USER_ID, task: null, messages: [] });

			await expect(generateHint(123, { mode: "content" })).rejects.toThrow("Task not found");
		});

		it("uses an empty-history placeholder for normal hints", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				task: { language: "en" },
				agentPromptSnapshot: { systemPrompt: "Context" },
				messages: [],
			});
			mockClient.chatJson.mockResolvedValue({ contentHint: "Add context." });

			await generateHint(123, { mode: "content" });

			const systemPrompt = mockClient.chatJson.mock.calls[0]?.[1]?.messages?.[0]?.content ?? "";
			expect(systemPrompt).toContain("(No messages yet)");
		});
	});

	describe("getSessionOrFail", () => {
		it("returns session when userId and taskId match", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: "u1",
				taskId: 456,
			});

			const session = await getSessionOrFail(123, "u1", 456);
			expect(session).toEqual({ id: 123, userId: "u1", taskId: 456 });
		});

		it("returns null when session not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			const session = await getSessionOrFail(999, "u1", 456);
			expect(session).toBeNull();
		});

		it("returns null when userId does not match", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: "other-user",
				taskId: 456,
			});

			const session = await getSessionOrFail(123, "u1", 456);
			expect(session).toBeNull();
		});

		it("returns null when taskId does not match", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: "u1",
				taskId: 999,
			});

			const session = await getSessionOrFail(123, "u1", 456);
			expect(session).toBeNull();
		});
	});

	describe("sendMessage history", () => {
		const mockSession = {
			id: 123,
			status: "in_progress",
			agentPromptSnapshot: { systemPrompt: "Test prompt." },
			messages: [],
		};

		it("uses full flat history; threaded UIs provide target context via promptContent", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [
					{ id: 10, role: "user", content: "Msg 1" },
					{ id: 20, role: "assistant", content: "Reply 1" },
				],
			});
			mockAgentReply("Flat reply");
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 30 }]) });
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "New msg", USER_ID);

			const historyArg = mockClient.chatTools.mock.calls[0][0].messages;
			expect(historyArg).toEqual([
				expect.objectContaining({ role: "system" }),
				expect.objectContaining({ content: "Msg 1" }),
				expect.objectContaining({ content: "Reply 1" }),
				expect.objectContaining({ content: "New msg" }),
			]);
		});
	});

	describe("sendMessage maxTurns", () => {
		const mockSession = {
			id: 123,
			status: "in_progress",
			agentPromptSnapshot: { systemPrompt: "Test prompt." },
			messages: [],
		};

		it("throws when maxTurns is reached", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [
					{ role: "user", content: "msg1" },
					{ role: "assistant", content: "reply1" },
					{ role: "user", content: "msg2" },
					{ role: "assistant", content: "reply2" },
				],
			});

			await expect(sendMessage(123, "msg3", USER_ID, undefined, { maxTurns: 2 })).rejects.toThrow("Maximum conversation turns reached");
		});

		it("does not throw when maxTurns is 0 (unlimited)", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [
					{ role: "user", content: "msg1" },
					{ role: "assistant", content: "reply1" },
				],
			});
			mockAgentReply("reply2");

			const result = await sendMessage(123, "msg2", USER_ID, undefined, { maxTurns: 0 });
			expect(result.reply).toBe("reply2");
		});
	});

	describe("buildRedditContext", () => {
		const redditTask = {
			id: 1,
			agentPrompt: "You are a Reddit user.",
			language: "en",
			template: { ui: "reddit" as const },
			variant: { openingState: {} },
		};

		beforeEach(() => {
			const returningMock = vi.fn().mockResolvedValue([{ id: 1 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });
		});

		it("includes post title and body when both are present", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...redditTask,
				variant: { openingState: { post: { title: "Best way to learn French?", body: "Any advice?" } } },
			});

			const result = await startSession(1, USER_ID);

			expect(result.systemPrompt).toContain("Scenario: Reddit post");
			expect(result.systemPrompt).toContain("Title: Best way to learn French?");
			expect(result.systemPrompt).toContain("Content: Any advice?");
		});

		it("shows only the title line when post has no body", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...redditTask,
				variant: { openingState: { post: { title: "Title only post" } } },
			});

			const result = await startSession(1, USER_ID);

			expect(result.systemPrompt).toContain("Title: Title only post");
			expect(result.systemPrompt).not.toContain("Content:");
		});

		it("shows only the content line when post has no title", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...redditTask,
				variant: { openingState: { post: { body: "Body only post" } } },
			});

			const result = await startSession(1, USER_ID);

			expect(result.systemPrompt).not.toContain("Title:");
			expect(result.systemPrompt).toContain("Content: Body only post");
		});

		it("adds existing comments section when previousComments are provided", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...redditTask,
				variant: {
					openingState: {
						post: { title: "Learning Spanish tips?" },
						previousComments: [
							{ author: "SpanishPro", text: "Use Anki for vocab.", replies: [{ author: "OP", text: "Thanks!" }] },
							{ author: "TravellerJane", text: "Immersion works best!" },
						],
					},
				},
			});

			const result = await startSession(1, USER_ID);

			expect(result.systemPrompt).toContain("Existing nested comments");
			expect(result.systemPrompt).toContain("- SpanishPro: Use Anki for vocab.");
			expect(result.systemPrompt).toContain("  - OP: Thanks!");
			expect(result.systemPrompt).toContain("- TravellerJane: Immersion works best!");
		});

		it("shows the base label with no extra lines when post is empty", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...redditTask,
				variant: { openingState: { post: {} } },
			});

			const result = await startSession(1, USER_ID);

			expect(result.systemPrompt).toContain("Scenario: Reddit post");
			expect(result.systemPrompt).not.toContain("Title:");
			expect(result.systemPrompt).not.toContain("Content:");
			expect(result.systemPrompt).not.toContain("Existing comments");
		});
	});

	describe("generateHint with contextPath", () => {
		const mockHintSession = {
			id: 123,
			userId: USER_ID,
			task: { language: "es" },
			agentPromptSnapshot: { systemPrompt: "Reddit roleplay context" },
			messages: [{ role: "assistant", content: "Feel free to reply to any comment." }],
		};

		it("adds comment thread context to the prompt when contextPath is provided", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockHintSession);
			mockClient.chatJson.mockResolvedValue({ contentHint: "Añade el motivo principal." });

			const contextPath = [
				{ author: "OriginalPoster", text: "Has anyone tried this method?" },
				{ author: "Replier", text: "Yes, it works great!" },
			];

			const result = await generateHint(123, { mode: "content", contextPath });

			expect(result).toEqual({ contentHint: "Añade el motivo principal." });

			const promptMessages = mockClient.chatJson.mock.calls[0][1].messages;
			const systemContent = promptMessages[0].content as string;

			expect(systemContent).toContain("Reply Context");
			expect(systemContent).toContain("OriginalPoster: Has anyone tried this method?");
			expect(systemContent).toContain("  Replier: Yes, it works great!");
		});

		it("skips the context section when contextPath is an empty array", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockHintSession);
			mockClient.chatJson.mockResolvedValue({ contentHint: "Añade contexto." });

			await generateHint(123, { mode: "content", contextPath: [] });

			const promptMessages = mockClient.chatJson.mock.calls[0][1].messages;
			const systemContent = promptMessages[0].content as string;

			expect(systemContent).not.toContain("Reply Context");
		});

		it("throws when the session has no task", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				task: null,
				agentPromptSnapshot: { systemPrompt: "..." },
				messages: [],
			});

			await expect(generateHint(123, { mode: "content" })).rejects.toThrow("Task not found");
		});
	});

	describe("sendMessage retry with generic thread metadata", () => {
		const mockSession = {
			id: 123,
			status: "in_progress",
			agentPromptSnapshot: { systemPrompt: "Test prompt." },
			messages: [
				{
					id: 5,
					role: "user",
					content: "My failed comment",
					llmMetadata: {
						clientMessageId: "msg-retry",
						failed: true,
						thread: { commentId: "reddit-user-msg-retry", targetCommentId: "c1" },
					},
				},
			],
		};

		it("updates the existing user message while preserving/merging thread metadata", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockAgentReply("Retry reply");

			const setMock = vi.fn().mockReturnValue({ where: vi.fn() });
			mockDb.update.mockReturnValue({ set: setMock });

			await sendMessage(123, "My failed comment", USER_ID, "msg-retry", {
				userMetadata: { thread: { commentId: "reddit-user-msg-retry", targetCommentId: "c1", responderName: "Commenter" } },
			});

			const updateCall = setMock.mock.calls[0][0];
			expect(updateCall.llmMetadata.failed).toBe(false);
			expect(updateCall.llmMetadata.thread).toEqual({ commentId: "reddit-user-msg-retry", targetCommentId: "c1", responderName: "Commenter" });
		});
	});
});
