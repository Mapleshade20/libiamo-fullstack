import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { completeSession, generateHint, sendMessage, startSession } from "$lib/server/session";

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
			const result = await sendMessage(123, "Hello!");

			expect(result.reply).toBe("Hello back!");
			expect(result.turnCount).toBe(1);
			expect(result.terminated).toBe(false);

			expect(mockClient.createStructuredOutput).toHaveBeenCalledWith(
				expect.any(Object),
				expect.arrayContaining([
					expect.objectContaining({ role: "system", content: expect.stringContaining("Your MBTI type is ENFP.") }),
					expect.objectContaining({ role: "user", content: "Hello!" }),
				]),
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
			await sendMessage(123, "Second message");

			expect(mockClient.createStructuredOutput).toHaveBeenCalledWith(
				expect.any(Object),
				expect.arrayContaining([
					expect.objectContaining({ role: "system" }),
					expect.objectContaining({ role: "user", content: "First message" }),
					expect.objectContaining({ role: "assistant", content: "First reply" }),
					expect.objectContaining({ role: "user", content: "Second message" }),
				]),
			);
		});

		it("throws when session not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			await expect(sendMessage(999, "Hello")).rejects.toThrow("Session not found");
		});

		it("throws when session not in progress", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				status: "completed",
			});

			await expect(sendMessage(123, "Hello")).rejects.toThrow("Session not in progress");
		});

		it("throws when userMessage is empty", async () => {
			await expect(sendMessage(123, "")).rejects.toThrow("userMessage is required");
			await expect(sendMessage(123, "   ")).rejects.toThrow("userMessage is required");
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
			const result = await sendMessage(123, "3");

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

			const result = await sendMessage(123, "Hello!", "msg-1");

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

			const result = await sendMessage(123, "Hello!", "msg-1");

			expect(result).toEqual({ reply: "", turnCount: 2, pending: true });
			expect(mockClient.createStructuredOutput).not.toHaveBeenCalled();
		});

		it("returns pending for duplicate clientMessageId while assistant reply is still processing", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [{ id: 1, role: "user", content: "Hello!", llmMetadata: { clientMessageId: "msg-1", failed: false } }],
			});

			const result = await sendMessage(123, "Hello!", "msg-1");

			expect(result).toEqual({ reply: "", turnCount: 1, pending: true });
			expect(mockClient.createStructuredOutput).not.toHaveBeenCalled();
		});

		it("retries failed generation without inserting a duplicate user message", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				...mockSession,
				messages: [{ id: 1, role: "user", content: "Hello!", llmMetadata: { clientMessageId: "msg-1", failed: true } }],
			});
			mockClient.createStructuredOutput.mockResolvedValue({ reply: "Recovered", terminate: false });

			const result = await sendMessage(123, "Hello!", "msg-1");

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

			await sendMessage(123, "User message");

			expect(valuesMock).toHaveBeenCalledTimes(2);
			expect(valuesMock).toHaveBeenNthCalledWith(1, { sessionId: 123, role: "user", content: "User message", llmMetadata: undefined });
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

			await sendMessage(123, "Ordering check");

			expect(valuesMock).toHaveBeenNthCalledWith(1, {
				sessionId: 123,
				role: "user",
				content: "Ordering check",
				llmMetadata: undefined,
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

			await sendMessage(123, "  Hello  ");

			expect(valuesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ content: "Hello" }));
		});

		it("persists prompt content with display metadata for AO3-style turns", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.createStructuredOutput.mockResolvedValue({
				reply: "Author reply",
				terminate: false,
			});
			const valuesMock = vi
				.fn()
				.mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })
				.mockReturnValueOnce(undefined);
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "Visible comment", "ao3-1", {
				promptContent: "Prompt context plus visible comment",
				userDisplayContent: "Visible comment",
				userMetadata: { ao3: { commentId: "ao3-user-ao3-1" } },
				assistantAuthorName: "FicAuthor",
				assistantMetadata: { ao3: { commentId: "ao3-agent-ao3-1", parentCommentId: "ao3-user-ao3-1" } },
			});

			expect(valuesMock).toHaveBeenNthCalledWith(1, {
				sessionId: 123,
				role: "user",
				content: "Prompt context plus visible comment",
				llmMetadata: expect.objectContaining({
					clientMessageId: "ao3-1",
					displayContent: "Visible comment",
					ao3: { commentId: "ao3-user-ao3-1" },
				}),
			});
			expect(valuesMock).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({
					role: "assistant",
					content: "Author reply",
					llmMetadata: expect.objectContaining({
						assistantAuthorName: "FicAuthor",
						ao3: { commentId: "ao3-agent-ao3-1", parentCommentId: "ao3-user-ao3-1" },
					}),
				}),
			);
			expect(mockClient.createStructuredOutput).toHaveBeenCalledWith(
				expect.any(Object),
				expect.arrayContaining([expect.objectContaining({ role: "user", content: "Prompt context plus visible comment" })]),
			);
		});

		it("persists user message even when LLM generation fails", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.createStructuredOutput.mockRejectedValue(new Error("LLM timeout"));
			const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) });
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await expect(sendMessage(123, "Need a reply")).rejects.toThrow("LLM timeout");

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

			await expect(sendMessage(123, "Need a reply", "msg-1")).rejects.toThrow("LLM timeout");

			expect(mockDb.update).toHaveBeenCalled();
		});
	});
	describe("generateHint", () => {
		it("generates hints based on session history and language", async () => {
			const mockSession = {
				id: 123,
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
			);
		});

		it("throws error if session is not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);
			await expect(generateHint(999)).rejects.toThrow("Session not found");
		});
	});
});
