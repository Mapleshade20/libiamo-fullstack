import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockSessionService } = vi.hoisted(() => ({
	mockDb: {
		query: {
			practiceSession: { findFirst: vi.fn() },
			task: { findFirst: vi.fn() },
		},
		select: vi.fn(),
	},
	mockSessionService: {
		startSession: vi.fn(),
		sendMessage: vi.fn(),
		completeSession: vi.fn(),
		generateHint: vi.fn(),
		getSessionOrFail: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/session", () => mockSessionService);

import { actions, load } from "$routes/(app)/task/[id]/session/+page.server";

describe("session page server", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	const mockUser = { id: "user_123", name: "Test User" };
	const mockTaskId = "456";
	const mockTask = {
		id: 456,
		title: "Test Task",
		template: { ui: "discord" as const },
		variant: { openingState: {} },
	};

	describe("load", () => {
		it("returns task and existing session when found", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 789,
				status: "in_progress",
				messages: [],
			});

			const result = (await load({
				params: { id: mockTaskId },
				locals: { user: mockUser },
				// Mock the parent function to resolve the avatarUrl
				parent: async () => ({ avatarUrl: "https://cn.cravatar.com/avatar/mockhash" }),
			} as any)) as { task: typeof mockTask; existingSession: { id: number } | null };

			expect(result.task).toEqual(mockTask);
			expect(result.existingSession).toBeDefined();
			expect(result.existingSession?.id).toBe(789);
		});

		it("returns null existingSession when no in-progress session", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			const result = (await load({
				params: { id: mockTaskId },
				locals: { user: mockUser },
				// Mock the parent function here as well
				parent: async () => ({ avatarUrl: "https://cn.cravatar.com/avatar/mockhash" }),
			} as any)) as { task: typeof mockTask; existingSession: { id: number } | null };

			expect(result.existingSession).toBeNull();
		});

		it("throws 401 when user not authenticated", async () => {
			await expect(
				load({
					params: { id: mockTaskId },
					locals: { user: null },
				} as any),
			).rejects.toMatchObject({ status: 401 });
		});

		it("throws 400 for invalid task ID", async () => {
			await expect(
				load({
					params: { id: "invalid" },
					locals: { user: mockUser },
				} as any),
			).rejects.toMatchObject({ status: 400 });
		});

		it("throws 404 when task not found", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(null);

			await expect(
				load({
					params: { id: "999" },
					locals: { user: mockUser },
				} as any),
			).rejects.toMatchObject({ status: 404 });
		});

		it("throws 501 when UI is not implemented", async () => {
			const unimplementedTask = {
				id: 456,
				title: "Test Task",
				template: { ui: "imessage" as const },
				variant: { openingState: {} },
			};
			mockDb.query.task.findFirst.mockResolvedValue(unimplementedTask);

			await expect(
				load({
					params: { id: mockTaskId },
					locals: { user: mockUser },
					parent: async () => ({ avatarUrl: "https://mock.com" }),
				} as any),
			).rejects.toMatchObject({ status: 501 });
		});
	});

	describe("actions.start", () => {
		it("creates new session successfully", async () => {
			mockSessionService.startSession.mockResolvedValue({
				sessionId: 789,
				systemPrompt: "Test prompt",
				mbti: "ENFP",
			});

			const result = await actions.start({
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({
				success: true,
				sessionId: 789,
				systemPrompt: "Test prompt",
				mbti: "ENFP",
			});
			expect(mockSessionService.startSession).toHaveBeenCalledWith(456, "user_123", "English");
		});

		it("returns fail 401 when user not authenticated", async () => {
			const result = await actions.start({
				params: { id: mockTaskId },
				locals: { user: null },
			} as any);

			expect(result).toMatchObject({ status: 401, data: { error: "Unauthorized" } });
		});

		it("returns fail 400 for invalid task ID", async () => {
			const result = await actions.start({
				params: { id: "invalid" },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 400, data: { error: "Invalid task ID" } });
		});

		it("returns fail 500 when startSession throws", async () => {
			mockSessionService.startSession.mockRejectedValue(new Error("DB error"));

			const result = await actions.start({
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 500, data: { error: "Failed to start session" } });
		});

		it("returns fail 500 when startSession throws a non-Error payload", async () => {
			mockSessionService.startSession.mockRejectedValue("String error instead of Error instance");

			const result = await actions.start({
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 500, data: { error: "Failed to start session" } });
		});
		it("returns fail 404 when startSession reports Task not found", async () => {
			mockSessionService.startSession.mockRejectedValue(new Error("Task not found"));
			const result = await actions.start({ params: { id: mockTaskId }, locals: { user: mockUser } } as any);
			expect(result).toMatchObject({ status: 404, data: { error: "Task not found" } });
		});
	});

	describe("actions.send", () => {
		beforeEach(() => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
		});
		it("sends message successfully", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.sendMessage.mockResolvedValue({
				reply: "Hello back",
				turnCount: 2,
			});

			const result = await actions.send({
				request: {
					formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789", message: "Hello" })[k] })),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({
				success: true,
				reply: "Hello back",
				turnCount: 2,
			});
			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(789, "Hello", undefined);
		});

		it("passes clientMessageId through to sendMessage", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.sendMessage.mockResolvedValue({
				reply: "Still working",
				turnCount: 2,
				pending: true,
			});

			await actions.send({
				request: {
					formData: () =>
						Promise.resolve(
							Object.assign(new FormData(), {
								get: (k: string) => ({ sessionId: "789", message: "Hello", clientMessageId: "msg-123" })[k],
							}),
						),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(789, "Hello", "msg-123");
		});

		it("returns fail 403 when session belongs to another user", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue(null);

			const result = await actions.send({
				request: {
					formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789", message: "Hello" })[k] })),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
		});

		it("returns fail 403 when session belongs to another task", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue(null);

			const result = await actions.send({
				request: {
					formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789", message: "Hello" })[k] })),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
		});

		it("returns fail 400 when sessionId is invalid", async () => {
			const result = await actions.send({
				request: {
					formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "invalid", message: "Hello" })[k] })),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 400, data: { error: "Invalid session ID" } });
		});

		it("returns fail 400 when message is empty", async () => {
			const result = await actions.send({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789", message: "" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 400, data: { error: "Message is required" } });
		});

		it("returns fail 401 when user not authenticated", async () => {
			const result = await actions.send({
				request: { formData: () => Promise.resolve(new FormData()) },
				params: { id: mockTaskId },
				locals: { user: null },
			} as any);

			expect(result).toMatchObject({ status: 401, data: { error: "Unauthorized" } });
		});

		it("returns fail 409 when sendMessage reports session not in progress", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.sendMessage.mockRejectedValue(new Error("Session not in progress"));

			const result = await actions.send({
				request: {
					formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789", message: "Hello" })[k] })),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 409, data: { error: "Session not in progress" } });
		});

		it("returns fail 404 when sendMessage reports session not found", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.sendMessage.mockRejectedValue(new Error("Session not found"));

			const result = await actions.send({
				request: {
					formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789", message: "Hello" })[k] })),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 404, data: { error: "Session not found" } });
		});

		it("returns fail 500 when sendMessage throws a non-Error payload", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.sendMessage.mockRejectedValue({ some: "object error" });

			const result = await actions.send({
				request: {
					formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789", message: "Hello" })[k] })),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 500, data: { error: "Failed to send message" } });
		});
		describe("actions.hint", () => {
			it("returns success with hints when called correctly", async () => {
				const mockHints = { hints: [{ text: "Test", translation: "Test" }] };
				mockSessionService.getSessionOrFail.mockResolvedValue({
					id: 123,
					userId: "user_123",
					taskId: 456,
				});
				mockSessionService.generateHint.mockResolvedValue(mockHints);

				const formData = new FormData();
				formData.append("sessionId", "123");

				const result = await actions.hint({
					request: { formData: () => Promise.resolve(formData) },
					params: { id: "456" },
					locals: { user: mockUser },
				} as any);

				expect(result).toEqual({ success: true, ...mockHints });
				expect(mockSessionService.generateHint).toHaveBeenCalledWith(123);
			});

			it("returns 401 when user is unauthenticated", async () => {
				const result = await actions.hint({
					locals: { user: null },
				} as any);

				expect(result).toMatchObject({ status: 401 });
			});

			it("returns 400 when sessionId is missing", async () => {
				const formData = new FormData();
				const result = await actions.hint({
					request: { formData: () => Promise.resolve(formData) },
					locals: { user: mockUser },
					params: { id: "456" },
				} as any);

				expect(result).toMatchObject({ status: 400 });
			});

			it("returns 400 when taskId is invalid", async () => {
				const formData = new FormData();
				formData.append("sessionId", "123");
				const result = await actions.hint({
					request: { formData: () => Promise.resolve(formData) },
					locals: { user: mockUser },
					params: { id: "invalid" },
				} as any);

				expect(result).toMatchObject({ status: 400, data: { error: "Invalid task ID" } });
			});

			it("returns 403 when session belongs to another user", async () => {
				mockSessionService.getSessionOrFail.mockResolvedValue(null);
				const formData = new FormData();
				formData.append("sessionId", "123");
				const result = await actions.hint({
					request: { formData: () => Promise.resolve(formData) },
					locals: { user: mockUser },
					params: { id: "456" },
				} as any);

				expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
			});

			it("returns 403 when session belongs to another task", async () => {
				mockSessionService.getSessionOrFail.mockResolvedValue(null);
				const formData = new FormData();
				formData.append("sessionId", "123");
				const result = await actions.hint({
					request: { formData: () => Promise.resolve(formData) },
					locals: { user: mockUser },
					params: { id: "456" },
				} as any);

				expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
			});

			it("returns 500 when generateHint fails", async () => {
				mockSessionService.getSessionOrFail.mockResolvedValue({
					id: 123,
					userId: "user_123",
					taskId: 456,
				});
				mockSessionService.generateHint.mockRejectedValue(new Error("AI error"));
				const formData = new FormData();
				formData.append("sessionId", "123");

				const result = await actions.hint({
					request: { formData: () => Promise.resolve(formData) },
					locals: { user: mockUser },
					params: { id: "456" },
				} as any);

				expect(result).toMatchObject({ status: 500 });
			});
		});
		it("returns fail 403 when maximum conversation turns reached", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ id: 456, template: { maxTurns: 5 } });
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });

			// Mock Drizzle count query
			const mockWhere = vi.fn().mockResolvedValue([{ count: 5 }]);
			const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
			mockDb.select.mockReturnValue({ from: mockFrom });

			const result = await actions.send({
				request: {
					formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789", message: "Hello" })[k] })),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 403, data: { error: "Maximum conversation turns reached" } });
		});

		it("returns fail 400 when sendMessage reports userMessage is required", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.sendMessage.mockRejectedValue(new Error("userMessage is required"));
			const result = await actions.send({
				request: {
					formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789", message: "Hello" })[k] })),
				},
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);
			expect(result).toMatchObject({ status: 400, data: { error: "userMessage is required" } });
		});
	});

	describe("actions.complete", () => {
		it("completes session successfully", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			const mockFeedback = {
				content: "Good job!",
				objectiveResults: [{ text: "Objective 1", grade: "A" as const }],
			};
			mockSessionService.completeSession.mockResolvedValue(mockFeedback);

			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ success: true, feedback: mockFeedback });
			expect(mockSessionService.completeSession).toHaveBeenCalledWith(789);
		});

		it("returns fail 403 when session belongs to another user", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue(null);

			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
		});

		it("returns fail 403 when session belongs to another task", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue(null);

			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
		});

		it("returns fail 400 when sessionId is invalid", async () => {
			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "invalid" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 400, data: { error: "Invalid session ID" } });
		});

		it("returns fail 400 for invalid task ID", async () => {
			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: "invalid" },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 400, data: { error: "Invalid task ID" } });
		});

		it("returns fail 401 when user not authenticated", async () => {
			const result = await actions.complete({
				request: { formData: () => Promise.resolve(new FormData()) },
				params: { id: mockTaskId },
				locals: { user: null },
			} as any);

			expect(result).toMatchObject({ status: 401, data: { error: "Unauthorized" } });
		});

		it("returns fail 500 when completeSession throws", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.completeSession.mockRejectedValue(new Error("DB error"));

			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 500, data: { error: "Failed to complete session" } });
		});

		it("returns fail 409 when completeSession reports not in progress or completed", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.completeSession.mockRejectedValue(new Error("Session not in progress or completed"));

			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 409, data: { error: "Session not in progress or completed" } });
		});
		it("returns fail 500 when completeSession throws a non-Error payload", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.completeSession.mockRejectedValue(12345);

			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 500, data: { error: "Failed to complete session" } });
		});
		it("returns fail 404 when completeSession reports Task not found", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.completeSession.mockRejectedValue(new Error("Task not found"));
			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);
			expect(result).toMatchObject({ status: 404, data: { error: "Task not found" } });
		});

		it("returns fail 404 when completeSession reports Session not found", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.completeSession.mockRejectedValue(new Error("Session not found"));
			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);
			expect(result).toMatchObject({ status: 404, data: { error: "Session not found" } });
		});
	});
});
