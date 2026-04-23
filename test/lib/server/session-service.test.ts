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
vi.mock("$lib/server/client", () => mockClient);

import { completeSession, sendMessage, startSession } from "$lib/server/session";

describe("session service", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	const mockTask = {
		id: 1,
		agentPrompt: "You are a helpful assistant.",
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
		it("creates session with MBTI and system prompt", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			expect(result.sessionId).toBe(123);
			expect(result.mbti).toMatch(/^(INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)$/);
			// MBTI is in snapshot but not in systemPrompt (already in agentPromptBase from tasks.ts)
			expect(result.systemPrompt).toContain("Discord");
			expect(result.systemPrompt).toContain("Alice");
			expect(result.systemPrompt).toContain("You are a helpful assistant.");
		});

		it("handles null agentPromptBase", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				agentPrompt: null,
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			// MBTI is in snapshot but not in systemPrompt when agentPrompt is null
			expect(result.systemPrompt).toContain("Discord");
			expect(result.systemPrompt).not.toContain("You are a helpful assistant.");
		});

		it("handles empty openingState", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				variant: { openingState: {} },
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			// MBTI is in snapshot but not in systemPrompt (already in agentPromptBase from tasks.ts)
			expect(result.systemPrompt).toContain("You are a helpful assistant.");
		});

		it("handles different UI types", async () => {
			const uiTypes = ["reddit", "apple_mail", "discord", "imessage", "ao3", "translator"] as const;

			for (const ui of uiTypes) {
				vi.resetAllMocks();
				mockDb.query.task.findFirst.mockResolvedValue({
					...mockTask,
					template: { ui },
					variant: { openingState: ui === "translator" ? { sourceText: "Hello" } : {} },
				});
				const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
				mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

				const result = await startSession(1, "user_456");
				expect(result.systemPrompt).toContain("You are a helpful assistant.");
			}
		});

		it("builds apple_mail scenario with full email details", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const },
				variant: {
					openingState: {
						emails: [{ from: "boss@company.com", subject: "Meeting tomorrow", body: "See you at 9am" }],
					},
				},
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			expect(result.systemPrompt).toContain("boss@company.com");
			expect(result.systemPrompt).toContain("Meeting tomorrow");
			expect(result.systemPrompt).toContain("See you at 9am");
		});

		it("builds apple_mail scenario with empty emails", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const },
				variant: { openingState: { emails: [] } },
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			expect(result.systemPrompt).toContain("Scenario: Mail app");
		});

		it("builds imessage scenario with previous messages", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "imessage" as const },
				variant: {
					openingState: {
						previousMessages: [
							{ sender: "Alice", text: "Hey!" },
							{ sender: "Bob", text: "What's up?" },
						],
					},
				},
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			expect(result.systemPrompt).toContain("Alice: Hey!");
			expect(result.systemPrompt).toContain("Bob: What's up?");
		});

		it("builds imessage scenario with empty previous messages", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "imessage" as const },
				variant: { openingState: { previousMessages: [] } },
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			expect(result.systemPrompt).toContain("Scenario: iMessage conversation");
			expect(result.systemPrompt).not.toContain("Previous:");
		});

		it("builds ao3 scenario with comments", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "ao3" as const },
				variant: {
					openingState: {
						workTitle: "My Fanfic",
						bodyExcerpt: "Once upon a time...",
						previousComments: [
							{ username: "reader1", comment: "Love this!" },
							{ username: "reader2", comment: "Great story" },
						],
					},
				},
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			expect(result.systemPrompt).toContain("Work: My Fanfic");
			expect(result.systemPrompt).toContain("reader1: Love this!");
			expect(result.systemPrompt).toContain("reader2: Great story");
		});

		it("builds ao3 scenario with empty comments", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "ao3" as const },
				variant: {
					openingState: {
						workTitle: "My Fanfic",
						previousComments: [],
					},
				},
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			expect(result.systemPrompt).toContain("Work: My Fanfic");
			expect(result.systemPrompt).not.toContain("Existing comments:");
		});

		it("handles unknown UI type gracefully", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "unknown_ui" as any },
				variant: { openingState: { someData: "test" } },
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			// Should not throw, just have empty scenario context
			expect(result.sessionId).toBe(123);
			expect(result.systemPrompt).toContain("You are a helpful assistant.");
		});

		it("builds reddit scenario correctly", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "reddit" as const },
				variant: {
					openingState: {
						post: { title: "Test Post", body: "Post content", subreddit: "r/test" },
						previousComments: [{ author: "user1", text: "Comment 1" }],
					},
				},
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			expect(result.systemPrompt).toContain("Reddit");
			expect(result.systemPrompt).toContain("Test Post");
			expect(result.systemPrompt).toContain("user1");
		});

		it("builds translator scenario correctly", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "translator" as const },
				variant: { openingState: { sourceText: "Bonjour" } },
			});
			const returningMock = vi.fn().mockResolvedValue([{ id: 123 }]);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: returningMock }) });

			const result = await startSession(1, "user_456");

			expect(result.systemPrompt).toContain("Bonjour");
		});

		it("throws when task not found", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(null);

			await expect(startSession(999, "user_456")).rejects.toThrow("Task not found");
		});

		it("throws when variant not found", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, variant: null });

			await expect(startSession(1, "user_456")).rejects.toThrow("Task not found");
		});

		it("throws when template not found", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: null });

			await expect(startSession(1, "user_456")).rejects.toThrow("Task not found");
		});

		it("throws when session creation fails", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) });

			await expect(startSession(1, "user_456")).rejects.toThrow("Failed to create session");
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
			mockClient.createMultiTurnChat.mockResolvedValue({
				reply: { content: "Hello back!", model: "gpt-4", raw: {} },
				messages: [],
			});
			mockDb.insert.mockReturnValue({ values: vi.fn() });

			const result = await sendMessage(123, "Hello!");

			expect(result.reply).toBe("Hello back!");
			expect(result.turnCount).toBe(1);
			expect(mockClient.createMultiTurnChat).toHaveBeenCalledWith(
				expect.objectContaining({
					history: [{ role: "system", content: "Your MBTI type is ENFP." }],
					userMessage: "Hello!",
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
			mockClient.createMultiTurnChat.mockResolvedValue({
				reply: { content: "Second reply", model: "gpt-4", raw: {} },
				messages: [],
			});
			mockDb.insert.mockReturnValue({ values: vi.fn() });

			await sendMessage(123, "Second message");

			expect(mockClient.createMultiTurnChat).toHaveBeenCalledWith(
				expect.objectContaining({
					history: [
						{ role: "system", content: "Your MBTI type is ENFP." },
						{ role: "user", content: "First message" },
						{ role: "assistant", content: "First reply" },
					],
					userMessage: "Second message",
				}),
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
			mockClient.createMultiTurnChat.mockResolvedValue({
				reply: { content: "c", model: "gpt-4", raw: {} },
				messages: [],
			});
			mockDb.insert.mockReturnValue({ values: vi.fn() });

			const result = await sendMessage(123, "3");

			expect(result.turnCount).toBe(3);
		});
	});

	describe("completeSession", () => {
		const mockSession = {
			id: 123,
			status: "in_progress",
			taskId: 1,
		};

		const mockTask = {
			id: 1,
			objectives: ["Use polite language", "Respond appropriately"],
		};

		it("marks session as completed and returns feedback", async () => {
			mockDb.query.practiceSession.findFirst
				.mockResolvedValueOnce(mockSession)
				.mockResolvedValueOnce({
					...mockSession,
					agentPromptSnapshot: { systemPrompt: "Scenario: Reddit post\nTitle: Test\n\nPrompt", mbti: "ENFP", ui: "reddit" },
					messages: [
						{ role: "user", content: "Hello" },
						{ role: "assistant", content: "Hi there" },
					],
					task: mockTask,
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
			expect(mockDb.update).toHaveBeenCalledTimes(2); // completed + evaluated
		});

		it("handles empty objectives", async () => {
			mockDb.query.practiceSession.findFirst
				.mockResolvedValueOnce(mockSession)
				.mockResolvedValueOnce({
					...mockSession,
					agentPromptSnapshot: { systemPrompt: "Scenario: Test\n\nPrompt", mbti: "ENFP", ui: "discord" },
					messages: [],
					task: { ...mockTask, objectives: [] },
				});
			const whereMock = vi.fn();
			mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: whereMock }) });

			const result = await completeSession(123);

			expect(result.content).toContain("No specific objectives");
			expect(result.objectiveResults).toHaveLength(0);
		});

		it("throws when session not found", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			await expect(completeSession(999)).rejects.toThrow("Session not found");
		});

		it("throws when session already completed", async () => {
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
			mockClient.createMultiTurnChat.mockResolvedValue({
				reply: { content: "AI reply", model: "gpt-4", raw: { usage: { tokens: 100 } } },
				messages: [],
			});
			const valuesMock = vi.fn();
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "User message");

			expect(valuesMock).toHaveBeenCalledWith([
				{ sessionId: 123, role: "user", content: "User message" },
				{ sessionId: 123, role: "assistant", content: "AI reply", llmMetadata: expect.any(Object) },
			]);
		});

		it("trims user message before saving", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession);
			mockClient.createMultiTurnChat.mockResolvedValue({
				reply: { content: "reply", model: "gpt-4", raw: {} },
				messages: [],
			});
			const valuesMock = vi.fn();
			mockDb.insert.mockReturnValue({ values: valuesMock });

			await sendMessage(123, "  Hello  ");

			expect(valuesMock).toHaveBeenCalledWith([expect.objectContaining({ content: "Hello" }), expect.any(Object)]);
		});
	});
});
