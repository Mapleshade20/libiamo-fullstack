import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockSessionService } = vi.hoisted(() => ({
	mockDb: {
		query: {
			practiceSession: { findFirst: vi.fn() },
			task: { findFirst: vi.fn() },
		},
	},
	mockSessionService: {
		startSession: vi.fn(),
		sendMessage: vi.fn(),
		completeSession: vi.fn(),
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
	});

	describe("actions.send", () => {
		it("sends message successfully", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
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
		});

		it("returns fail 403 when session belongs to another user", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 789,
				userId: "other_user",
				taskId: 456,
			});

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
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 999,
			});

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
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
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
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
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
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
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
	});

	describe("actions.complete", () => {
		it("completes session successfully", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
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
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 789,
				userId: "other_user",
				taskId: 456,
			});

			const result = await actions.complete({
				request: { formData: () => Promise.resolve(Object.assign(new FormData(), { get: (k: string) => ({ sessionId: "789" })[k] })) },
				params: { id: mockTaskId },
				locals: { user: mockUser },
			} as any);

			expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
		});

		it("returns fail 403 when session belongs to another task", async () => {
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 999,
			});

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
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
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
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
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
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
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
	});
});
