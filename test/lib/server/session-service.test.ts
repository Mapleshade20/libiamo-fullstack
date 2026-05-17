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
		createMultiTurnChat: vi.fn(),
		createStructuredOutput: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/llm", () => mockClient);

import {
	completeSession,
	generateHint,
	generateMailHint,
	getSessionOrFail,
	sendMessage,
	startSession,
	submitOneShotMessage,
} from "$lib/server/session";

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

			expect(result.systemPrompt).toContain("Existing comments:\n- Mina: Hola: 3");
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
				requiredText: "Scenario: AO3 work page",
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

			mockClient.createStructuredOutput.mockResolvedValue({
				reply: "Hello back!",
				terminate: false,
			});
			const result = await sendMessage(123, "Hello!", USER_ID);

			expect(result.reply).toBe("Hello back!");
			expect(result.turnCount).toBe(1);
			expect(result.terminated).toBe(false);

			expect(mockClient.createStructuredOutput).toHaveBeenCalledWith(
				expect.any(Object),
				expect.arrayContaining([
					expect.objectContaining({ role: "system", content: expect.stringContaining("Your MBTI type is ENFP.") }),
					expect.objectContaining({ role: "user", content: "Hello!" }),
				]),
				{},
				USER_ID,
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

			mockClient.createStructuredOutput.mockResolvedValue({
				reply: "Second reply",
				terminate: false,
			});
			await sendMessage(123, "Second message", USER_ID);

			expect(mockClient.createStructuredOutput).toHaveBeenCalledWith(
				expect.any(Object),
				expect.arrayContaining([
					expect.objectContaining({ role: "system" }),
					expect.objectContaining({ role: "user", content: "First message" }),
					expect.objectContaining({ role: "assistant", content: "First reply" }),
					expect.objectContaining({ role: "user", content: "Second message" }),
				]),
				{},
				USER_ID,
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

			mockClient.createStructuredOutput.mockResolvedValue({
				reply: "c",
				terminate: false,
			});
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
			expect(mockClient.createStructuredOutput).not.toHaveBeenCalled();
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
			expect(mockClient.createStructuredOutput).not.toHaveBeenCalled();
		});

		it("returns pending for duplicate clientMessageId while assistant reply is still processing", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [{ id: 1, role: "user", content: "Hello!", llmMetadata: { clientMessageId: "msg-1", failed: false } }],
			});

			const result = await sendMessage(123, "Hello!", USER_ID, "msg-1");

			expect(result).toEqual({ reply: "", turnCount: 1, pending: true });
			expect(mockClient.createStructuredOutput).not.toHaveBeenCalled();
		});

		it("retries failed generation without inserting a duplicate user message", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [{ id: 1, role: "user", content: "Hello!", llmMetadata: { clientMessageId: "msg-1", failed: true } }],
			});
			mockClient.createStructuredOutput.mockResolvedValue({ reply: "Recovered", terminate: false });

			const result = await sendMessage(123, "Hello!", USER_ID, "msg-1");

			expect(result).toEqual({ reply: "Recovered", turnCount: 1, terminated: false });
			expect(mockDb.update).toHaveBeenCalled();
			expect(mockDb.insert).toHaveBeenCalledTimes(1);
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
					{ role: "user", content: "Hello" },
					{ role: "assistant", content: "Hi there" },
				],
				task: mockTaskObjectives,
			});
			const whereMock = vi.fn();
			mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: whereMock }) });

			mockClient.createStructuredOutput.mockResolvedValue({
				content: "Good job!",
				objectiveResults: [
					{ text: "Use polite language", grade: "A" },
					{ text: "Respond appropriately", grade: "B" },
				],
			});

			const result = await completeSession(123);

			expect(result.content).toBe("Good job!");
			expect(result.objectiveResults).toHaveLength(2);
			expect(mockDb.update).toHaveBeenCalledTimes(2);
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

			mockClient.createStructuredOutput.mockResolvedValue({
				content: "General fluency assessment here.",
				objectiveResults: [],
			});

			const result = await completeSession(123);

			expect(result.content).toBe("General fluency assessment here.");
			expect(result.objectiveResults).toHaveLength(0);
		});

		it("includes email presentation notes in the evaluation prompt", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValueOnce(mockSession).mockResolvedValueOnce({
				...mockSession,
				agentPromptSnapshot: {
					systemPrompt: "Mail prompt",
					mbti: "ENFP",
					ui: "apple_mail",
					scenarioContext: "Scenario: Received email",
				},
				messages: [
					{
						role: "user",
						content: "To: Maya\nSubject: Deadline\n\nPlease reply by Friday.",
						llmMetadata: {
							presentationReport: "Marked email body:\nPlease reply by **Friday**.",
						},
					},
				],
				task: mockTaskObjectives,
			});
			mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) });
			mockClient.createStructuredOutput.mockResolvedValue({
				content: "Good email.",
				objectiveResults: [{ text: "Use polite language", grade: "A" }],
			});

			await completeSession(123);

			const messages = mockClient.createStructuredOutput.mock.calls[0]?.[1];
			expect(messages?.[0]?.content).toContain("## Email Presentation Notes");
			expect(messages?.[0]?.content).toContain("Marked email body:\nPlease reply by **Friday**.");
			expect(messages?.[0]?.content).toContain("Markers such as **text**");
		});

		it("throws when session not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			await expect(completeSession(999)).rejects.toThrow("Session not found");
		});

		it("throws when session already completed", async () => {
			mockDb.query.practiceSession.findFirst
				.mockResolvedValueOnce({
					...mockSession,
					status: "completed",
				})
				.mockResolvedValueOnce({
					...mockSession,
					agentPromptSnapshot: { systemPrompt: "Scenario: Reddit post\nTitle: Test\n\nPrompt", mbti: "ENFP", ui: "reddit" },
					messages: [
						{ role: "user", content: "Hello" },
						{ role: "assistant", content: "Hi there" },
					],
					task: mockTaskObjectives,
				});
			const whereMock = vi.fn();
			mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: whereMock }) });
			mockClient.createStructuredOutput.mockResolvedValue({
				content: "Good retry!",
				objectiveResults: [
					{ text: "Use polite language", grade: "A" },
					{ text: "Respond appropriately", grade: "A" },
				],
			});

			const result = await completeSession(123);

			expect(result.content).toBe("Good retry!");
			expect(mockDb.update).toHaveBeenCalledTimes(1);
		});

		it("throws when session already evaluated", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				status: "evaluated",
			});

			await expect(completeSession(123)).rejects.toThrow("Session not in progress or completed");
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
			mockClient.createStructuredOutput.mockResolvedValue({
				reply: "AI reply",
				terminate: false,
			});
			const valuesMock = vi
				.fn()
				.mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })
				.mockReturnValueOnce(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "User message", USER_ID);

			expect(valuesMock).toHaveBeenCalledTimes(2);
			expect(valuesMock).toHaveBeenNthCalledWith(1, { sessionId: 123, role: "user", content: "User message" });
			expect(valuesMock).toHaveBeenNthCalledWith(2, {
				sessionId: 123,
				role: "assistant",
				content: "AI reply",
				llmMetadata: expect.any(Object),
			});
		});

		it("persists user message before requesting LLM output", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.createStructuredOutput.mockResolvedValue({
				reply: "AI reply",
				terminate: false,
			});
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
			});
			expect(valuesMock.mock.invocationCallOrder[0]).toBeLessThan(mockClient.createStructuredOutput.mock.invocationCallOrder[0]);
		});

		it("trims user message before saving", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.createStructuredOutput.mockResolvedValue({
				reply: "reply",
				terminate: false,
			});
			const valuesMock = vi
				.fn()
				.mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })
				.mockReturnValueOnce(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "  Hello  ", USER_ID);

			expect(valuesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ content: "Hello" }));
		});

		it("persists user message even when LLM generation fails", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.createStructuredOutput.mockRejectedValue(new Error("LLM timeout"));
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
			mockClient.createStructuredOutput.mockRejectedValue(new Error("LLM timeout"));
			const valuesMock = vi
				.fn()
				.mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1, llmMetadata: { clientMessageId: "msg-1", failed: false } }]) });
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await expect(sendMessage(123, "Need a reply", USER_ID, "msg-1")).rejects.toThrow("LLM timeout");

			expect(mockDb.update).toHaveBeenCalled();
		});
	});

	describe("submitOneShotMessage", () => {
		const mockSession = {
			id: 123,
			status: "in_progress",
			agentPromptSnapshot: { systemPrompt: "Test prompt." },
			messages: [],
		};

		it("persists a one-shot user message with client id and presentation report metadata", async () => {
			const valuesMock = vi.fn();
			mockDb.insert.mockReturnValue({ values: valuesMock });
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);

			const result = await submitOneShotMessage(123, "  To: Maya\nSubject: Hi\n\nHello  ", "mail-1", {
				maxTurns: 1,
				presentationReport: "  Presentation: [size=5]large[/size]  ",
			});

			expect(result).toEqual({ turnCount: 1 });
			expect(valuesMock).toHaveBeenCalledWith({
				sessionId: 123,
				role: "user",
				content: "To: Maya\nSubject: Hi\n\nHello",
				llmMetadata: {
					clientMessageId: "mail-1",
					failed: false,
					presentationReport: "Presentation: [size=5]large[/size]",
				},
			});
		});

		it("throws when one-shot message is empty", async () => {
			await expect(submitOneShotMessage(123, "   ")).rejects.toThrow("userMessage is required");
		});

		it("throws when one-shot session is missing", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			await expect(submitOneShotMessage(123, "Hello")).rejects.toThrow("Session not found");
		});

		it("throws when one-shot session is not in progress", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({ ...mockSession, status: "completed" });

			await expect(submitOneShotMessage(123, "Hello")).rejects.toThrow("Session not in progress");
		});

		it("returns the current turn count for duplicate one-shot client ids", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [{ role: "user", content: "Existing", llmMetadata: { clientMessageId: "mail-1", failed: false } }],
			});

			const result = await submitOneShotMessage(123, "Existing", "mail-1", { maxTurns: 1 });

			expect(result).toEqual({ turnCount: 1 });
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it("throws when the one-shot max turn has already been used", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [{ role: "user", content: "Existing" }],
			});

			await expect(submitOneShotMessage(123, "Another email", undefined, { maxTurns: 1 })).rejects.toThrow("Maximum conversation turns reached");
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
			mockClient.createStructuredOutput.mockResolvedValue({
				hints: [{ text: "こんにちは", translation: "Hello" }],
			});

			const result = await generateHint(123);

			expect(result.hints).toHaveLength(1);
			expect(result.hints[0].text).toBe("こんにちは");
			expect(mockClient.createStructuredOutput).toHaveBeenCalledWith(
				expect.any(Object),
				expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining("JAPANESE") })]),
				{},
				USER_ID,
			);
		});

		it("throws error if session is not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);
			await expect(generateHint(999)).rejects.toThrow("Session not found");
		});
	});

	describe("generateMailHint", () => {
		it("generates subject, section, sentence, and checklist suggestions from the current draft", async () => {
			const mockSession = {
				id: 123,
				userId: USER_ID,
				task: { language: "es" },
				agentPromptSnapshot: { systemPrompt: "Reply to the scheduling email." },
				messages: [],
			};

			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.createStructuredOutput.mockResolvedValue({
				mailHint: {
					subjectSuggestion: { text: "Reunión del viernes" },
					nextSection: { title: "Cierre", text: "Quedo atento a su respuesta." },
					nextSentence: { title: "Siguiente frase", text: "Podemos reunirnos el viernes." },
					checklist: [{ text: "Incluye saludo", done: true, note: "Ya está presente." }],
				},
			});

			const result = await generateMailHint(123, {
				to: "Maya Chen <maya@example.com>",
				subject: "Reunión",
				body: "Hola Maya,",
			});

			expect(result.mailHint.subjectSuggestion.text).toBe("Reunión del viernes");
			const call = mockClient.createStructuredOutput.mock.calls[0];
			expect(call?.[0]).toEqual(expect.any(Object));
			expect(call?.[2]).toEqual({ temperature: 0.2, maxTokens: 1600 });
			expect(call?.[1]).toEqual([
				expect.objectContaining({
					role: "system",
					content: expect.stringContaining("Current Unsaved Draft"),
				}),
				expect.objectContaining({ role: "user", content: expect.stringContaining("Spanish") }),
			]);
			const systemPrompt = call?.[1]?.[0]?.content ?? "";
			expect(systemPrompt).toContain("To: Maya Chen <maya@example.com>");
			expect(systemPrompt).toContain("Subject: Reunión");
			expect(systemPrompt).toContain("Body:\n\tHola Maya,");
			expect(systemPrompt).toContain("SPANISH ONLY");
			expect(systemPrompt).toContain("Put any subject-line idea ONLY in subjectSuggestion.text");

			const schema = call?.[0] as { parse: (value: unknown) => unknown };
			expect(
				schema.parse({
					mailHint: {
						subjectSuggestion: null,
						nextSection: { title: "Empty", text: "   " },
						nextSentence: { title: "Next", text: "Podemos reunirnos el viernes." },
						checklist: [
							{ text: "", done: true, note: "" },
							{ text: "Confirma la hora", done: "yes", note: "Todavía falta." },
						],
					},
				}),
			).toEqual({
				mailHint: {
					subjectSuggestion: { text: "" },
					nextSection: null,
					nextSentence: { title: "Next", text: "Podemos reunirnos el viernes." },
					checklist: [{ text: "Confirma la hora", done: false, note: "Todavía falta." }],
				},
			});
			expect(schema.parse({ mailHint: "not-an-object" })).toEqual({
				mailHint: {
					subjectSuggestion: { text: "" },
					nextSection: null,
					nextSentence: null,
					checklist: [],
				},
			});
		});

		it("includes visible submitted messages and hides hidden startup messages", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 123,
				userId: USER_ID,
				task: { language: "en" },
				agentPromptSnapshot: { systemPrompt: "Mail prompt" },
				messages: [
					{ role: "user", content: "*User joined the server*", llmMetadata: { hidden: true } },
					{ role: "user", content: "Previously submitted email", llmMetadata: { hidden: false } },
				],
			});
			mockClient.createStructuredOutput.mockResolvedValue({
				mailHint: { subjectSuggestion: { text: "" }, nextSection: null, nextSentence: null, checklist: [] },
			});

			await generateMailHint(123, { body: "" });

			const systemPrompt = mockClient.createStructuredOutput.mock.calls[0]?.[1]?.[0]?.content ?? "";
			expect(systemPrompt).toContain("[user] Previously submitted email");
			expect(systemPrompt).not.toContain("*User joined the server*");
			expect(systemPrompt).toContain("To: (empty)");
			expect(systemPrompt).toContain("Subject: (empty)");
			expect(systemPrompt).toContain("Body:\n\t(empty)");
		});

		it("throws when mail hint session is missing", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			await expect(generateMailHint(999, { body: "Hello" })).rejects.toThrow("Session not found");
		});

		it("throws when mail hint session has no task", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({ id: 123, userId: USER_ID, task: null, messages: [] });

			await expect(generateMailHint(123, { body: "Hello" })).rejects.toThrow("Task not found");
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
			mockClient.createStructuredOutput.mockResolvedValue({
				reply: "reply2",
				terminate: false,
			});

			const result = await sendMessage(123, "msg2", USER_ID, undefined, { maxTurns: 0 });
			expect(result.reply).toBe("reply2");
		});
	});
});
