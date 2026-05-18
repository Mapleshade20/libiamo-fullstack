import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockSessionService } = vi.hoisted(() => ({
	mockDb: {
		query: {
			practiceSession: { findFirst: vi.fn() },
			task: { findFirst: vi.fn() },
			user: { findFirst: vi.fn() },
		},
		select: vi.fn(),
	},
	mockSessionService: {
		startSession: vi.fn(),
		sendMessage: vi.fn(),
		submitOneShotMessage: vi.fn(),
		completeSession: vi.fn(),
		generateHint: vi.fn(),
		generateMailHint: vi.fn(),
		getSessionOrFail: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/session", () => mockSessionService);

import { actions, load } from "$routes/(app)/task/[id]/session/+page.server";

describe("session page server", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockDb.query.user.findFirst.mockResolvedValue(null);
	});

	const mockUser = { id: "user_123", name: "Test User", activeLanguage: "en", timezone: "UTC" };
	const mockTaskId = "456";
	const mockTask = {
		id: 456,
		title: "Test Task",
		language: "en",
		template: { ui: "discord" as const, maxTurns: 0 },
		variant: { openingState: {} },
	};

	const createFormEvent = ({
		taskId = mockTaskId,
		user = mockUser,
		values = {},
	}: {
		taskId?: string;
		user?: typeof mockUser | null;
		values?: Record<string, string>;
	}) => {
		const formData = new FormData();
		for (const [key, value] of Object.entries(values)) {
			formData.append(key, value);
		}
		return {
			request: { formData: () => Promise.resolve(formData) },
			params: { id: taskId },
			locals: { user },
		} as any;
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
			const sessionQuery = mockDb.query.practiceSession.findFirst.mock.calls[0]?.[0];
			expect(sessionQuery.orderBy({ startedAt: "startedAt" }, { desc: (value: string) => `desc:${value}` })).toEqual(["desc:startedAt"]);
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

		it("uses the latest profile timezone from the database", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);
			mockDb.query.user.findFirst.mockResolvedValue({ name: "Updated Name", timezone: "Asia/Shanghai" });

			const result = (await load({
				params: { id: mockTaskId },
				locals: { user: { ...mockUser, name: "Stale Name", timezone: "UTC" } },
				parent: async () => ({ avatarUrl: "https://cn.cravatar.com/avatar/mockhash" }),
			} as any)) as { user: { name: string; timezone: string } };

			expect(result.user.name).toBe("Updated Name");
			expect(result.user.timezone).toBe("Asia/Shanghai");
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

		it("returns task when task language differs from active language", async () => {
			const spanishTask = { ...mockTask, language: "es" };
			mockDb.query.task.findFirst.mockResolvedValue(spanishTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			const result = (await load({
				params: { id: mockTaskId },
				locals: { user: mockUser },
				parent: async () => ({ avatarUrl: "https://cn.cravatar.com/avatar/mockhash" }),
			} as any)) as { task: typeof spanishTask; existingSession: { id: number } | null };

			expect(result.task).toEqual(spanishTask);
			expect(result.existingSession).toBeNull();
		});

		it("returns task data when UI is imessage", async () => {
			const imessageTask = {
				id: 456,
				title: "Test Task",
				language: "en",
				template: { ui: "imessage" as const },
				variant: { openingState: {} },
			};
			mockDb.query.task.findFirst.mockResolvedValue(imessageTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			const result = (await load({
				params: { id: mockTaskId },
				locals: { user: mockUser },
				parent: async () => ({ avatarUrl: "https://mock.com" }),
			} as any)) as { task: typeof imessageTask };

			expect(result.task.template.ui).toBe("imessage");
		});

		it("throws 501 when UI is not implemented", async () => {
			const unimplementedTask = {
				id: 456,
				title: "Test Task",
				language: "en",
				template: { ui: "reddit" as const },
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

		it("allows apple_mail tasks", async () => {
			const mailTask = {
				...mockTask,
				template: { ui: "apple_mail" as const, maxTurns: 1, interactionType: "oneshot" },
			};
			mockDb.query.task.findFirst.mockResolvedValue(mailTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			const result = (await load({
				params: { id: mockTaskId },
				locals: { user: mockUser },
				parent: async () => ({ avatarUrl: "https://mock.com/avatar.png" }),
			} as any)) as { task: typeof mailTask; existingSession: null };

			expect(result.task).toEqual(mailTask);
			expect(result.existingSession).toBeNull();
		});
	});

	describe("actions.start", () => {
		beforeEach(() => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
		});

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
			expect(mockSessionService.startSession).toHaveBeenCalledWith(456, "user_123");
		});

		it("starts session when task language differs from active language", async () => {
			mockSessionService.startSession.mockResolvedValue({
				sessionId: 789,
				systemPrompt: "Test prompt",
				mbti: "ENFP",
			});

			const result = await actions.start({
				params: { id: mockTaskId },
				locals: { user: { ...mockUser, activeLanguage: "fr" } },
			} as any);

			expect(result).toMatchObject({ success: true, sessionId: 789 });
			expect(mockSessionService.startSession).toHaveBeenCalledWith(456, "user_123");
		});

		it("maps Task not found from service to 404", async () => {
			mockSessionService.startSession.mockRejectedValue(new Error("Task not found"));
			const result = await actions.start({ params: { id: mockTaskId }, locals: { user: mockUser } } as any);
			expect(result).toMatchObject({ status: 404, data: { error: "Task not found" } });
		});

		it.each([
			{
				name: "unauthenticated user",
				event: { params: { id: mockTaskId }, locals: { user: null } },
				expected: { status: 401, data: { error: "Unauthorized" } },
			},
			{
				name: "invalid task id",
				event: { params: { id: "invalid" }, locals: { user: mockUser } },
				expected: { status: 400, data: { error: "Invalid task ID" } },
			},
			{
				name: "unexpected service failure",
				event: { params: { id: mockTaskId }, locals: { user: mockUser } },
				setup: () => mockSessionService.startSession.mockRejectedValue(new Error("DB error")),
				expected: { status: 500, data: { error: "Failed to start session" } },
			},
			{
				name: "non-error payload from service",
				event: { params: { id: mockTaskId }, locals: { user: mockUser } },
				setup: () => mockSessionService.startSession.mockRejectedValue("String error"),
				expected: { status: 500, data: { error: "Failed to start session" } },
			},
		])("returns controlled failures for $name", async ({ event, expected, setup }) => {
			setup?.();
			const result = await actions.start(event as any);
			expect(result).toMatchObject(expected);
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

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));

			expect(result).toMatchObject({
				success: true,
				reply: "Hello back",
				turnCount: 2,
			});
			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(789, "Hello", "user_123", undefined, { hiddenUserMessage: false, maxTurns: 0 });
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

			await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello", clientMessageId: "msg-123" } }));

			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(789, "Hello", "user_123", "msg-123", { hiddenUserMessage: false, maxTurns: 0 });
		});

		it("builds AO3 prompt metadata for a nested comment reply", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "ao3" as const, maxTurns: 4 },
				variant: {
					openingState: {
						workTitle: "My Fic",
						authorName: "FicAuthor",
						previousComments: [{ id: "c1", username: "ReaderA", comment: "Great start!" }],
					},
				},
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.sendMessage.mockResolvedValue({ reply: "Thanks!", turnCount: 1 });

			const result = await actions.send(
				createFormEvent({ values: { sessionId: "789", message: "What did you like?", clientMessageId: "ao3-msg", ao3TargetCommentId: "c1" } }),
			);

			expect(result).toMatchObject({ success: true, reply: "Thanks!" });
			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(
				789,
				"What did you like?",
				"user_123",
				"ao3-msg",
				expect.objectContaining({
					hiddenUserMessage: false,
					maxTurns: 4,
					promptContent: expect.stringContaining("Comment author you must roleplay as: ReaderA"),
					userDisplayContent: "What did you like?",
					assistantAuthorName: "ReaderA",
					userMetadata: { ao3: { commentId: "ao3-user-ao3-msg", targetCommentId: "c1", responderName: "ReaderA", mode: "reply" } },
				}),
			);
		});

		it("rejects an invalid AO3 reply target", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "ao3" as const, maxTurns: 4 },
				variant: { openingState: { workTitle: "My Fic", previousComments: [] } },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockDb.query.practiceSession.findFirst.mockResolvedValue({ messages: [] });

			const result = await actions.send(
				createFormEvent({ values: { sessionId: "789", message: "Hello", clientMessageId: "ao3-msg", ao3TargetCommentId: "missing" } }),
			);

			expect(result).toMatchObject({ status: 400, data: { error: "Invalid AO3 reply target" } });
			expect(mockSessionService.sendMessage).not.toHaveBeenCalled();
		});

		it("retries failed AO3 turns from persisted metadata even if the target no longer resolves", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "ao3" as const, maxTurns: 4 },
				variant: { openingState: { workTitle: "My Fic", authorName: "FicAuthor", previousComments: [] } },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				messages: [
					{
						id: 12,
						role: "user",
						content: "Persisted prompt context from original failed turn",
						createdAt: new Date("2026-01-01T10:00:00Z"),
						llmMetadata: {
							clientMessageId: "ao3-msg",
							failed: true,
							displayContent: "Hello again",
							ao3: { commentId: "ao3-user-ao3-msg", targetCommentId: "missing", responderName: "ReaderA", mode: "reply" },
						},
					},
				],
			});
			mockSessionService.sendMessage.mockResolvedValue({ reply: "Recovered", turnCount: 1 });

			const result = await actions.send(
				createFormEvent({ values: { sessionId: "789", message: "Hello again", clientMessageId: "ao3-msg", ao3TargetCommentId: "missing" } }),
			);

			expect(result).toMatchObject({ success: true, reply: "Recovered" });
			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(
				789,
				"Hello again",
				"user_123",
				"ao3-msg",
				expect.objectContaining({
					assistantAuthorName: "ReaderA",
					userDisplayContent: "Hello again",
					userMetadata: { ao3: { commentId: "ao3-user-ao3-msg", targetCommentId: "missing", responderName: "ReaderA", mode: "reply" } },
				}),
			);
		});

		it("sends message when task language differs from active language", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, language: "es" });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.sendMessage.mockResolvedValue({
				reply: "Hola",
				turnCount: 1,
			});

			const result = await actions.send(
				createFormEvent({ user: { ...mockUser, activeLanguage: "fr" }, values: { sessionId: "789", message: "Hola" } }),
			);

			expect(result).toMatchObject({ success: true, reply: "Hola" });
			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(789, "Hola", "user_123", undefined, { hiddenUserMessage: false, maxTurns: 0 });
		});

		it("returns fail 403 when session ownership check fails", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue(null);

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));

			expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
		});

		it("returns fail 404 when send task lookup fails", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(null);

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));

			expect(result).toMatchObject({ status: 404, data: { error: "Task not found" } });
			expect(mockSessionService.getSessionOrFail).not.toHaveBeenCalled();
		});

		it.each([
			{
				name: "unauthenticated user",
				event: createFormEvent({ user: null, values: { sessionId: "789", message: "Hello" } }),
				expected: { status: 401, data: { error: "Unauthorized" } },
			},
			{
				name: "invalid task id",
				event: createFormEvent({ taskId: "invalid", values: { sessionId: "789", message: "Hello" } }),
				expected: { status: 400, data: { error: "Invalid task ID" } },
			},
			{
				name: "invalid session id",
				event: createFormEvent({ values: { sessionId: "invalid", message: "Hello" } }),
				expected: { status: 400, data: { error: "Invalid session ID" } },
			},
			{
				name: "empty message",
				event: createFormEvent({ values: { sessionId: "789", message: "" } }),
				expected: { status: 400, data: { error: "Message is required" } },
			},
		])("returns controlled failures for $name", async ({ event, expected }) => {
			const result = await actions.send(event);
			expect(result).toMatchObject(expected);
		});

		it.each([
			{ error: "userMessage is required", status: 400 },
			{ error: "Session not found", status: 404 },
			{ error: "Session not in progress", status: 409 },
		])("maps service error '$error' to $status", async ({ error, status }) => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.sendMessage.mockRejectedValue(new Error(error));

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));
			expect(result).toMatchObject({ status, data: { error } });
		});

		it("returns 500 for unexpected non-Error failures", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.sendMessage.mockRejectedValue({ some: "object error" });

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));
			expect(result).toMatchObject({ status: 500, data: { error: "Failed to send message" } });
		});

		it("returns 500 for unexpected Error failures", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.sendMessage.mockRejectedValue(new Error("Unexpected transport error"));

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));
			expect(result).toMatchObject({ status: 500, data: { error: "Failed to send message" } });
		});

		it("returns fail 403 when maximum conversation turns reached", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ id: 456, language: "en", template: { maxTurns: 5 } });
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });

			mockSessionService.sendMessage.mockRejectedValue(new Error("Maximum conversation turns reached"));

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));

			expect(result).toMatchObject({ status: 403, data: { error: "Maximum conversation turns reached" } });
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

			const result = await actions.complete(createFormEvent({ values: { sessionId: "789" } }));

			expect(result).toMatchObject({ success: true, feedback: mockFeedback });
			expect(mockSessionService.completeSession).toHaveBeenCalledWith(789);
		});

		it("returns fail 403 when ownership check fails", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue(null);

			const result = await actions.complete(createFormEvent({ values: { sessionId: "789" } }));

			expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
		});

		it.each([
			{
				name: "invalid session id",
				event: createFormEvent({ values: { sessionId: "invalid" } }),
				expected: { status: 400, data: { error: "Invalid session ID" } },
			},
			{
				name: "invalid task id",
				event: createFormEvent({ taskId: "invalid", values: { sessionId: "789" } }),
				expected: { status: 400, data: { error: "Invalid task ID" } },
			},
			{
				name: "unauthenticated user",
				event: createFormEvent({ user: null, values: { sessionId: "789" } }),
				expected: { status: 401, data: { error: "Unauthorized" } },
			},
		])("returns controlled failures for $name", async ({ event, expected }) => {
			const result = await actions.complete(event);
			expect(result).toMatchObject(expected);
		});

		it.each([
			{ error: "Session not in progress or completed", status: 409 },
			{ error: "Task not found", status: 404 },
			{ error: "Session not found", status: 404 },
		])("maps completeSession error '$error' to $status", async ({ error, status }) => {
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.completeSession.mockRejectedValue(new Error(error));

			const result = await actions.complete(createFormEvent({ values: { sessionId: "789" } }));
			expect(result).toMatchObject({ status, data: { error } });
		});

		it("returns fail 500 for unknown completeSession failures", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.completeSession.mockRejectedValue(12345);

			const result = await actions.complete(createFormEvent({ values: { sessionId: "789" } }));
			expect(result).toMatchObject({ status: 500, data: { error: "Failed to complete session" } });
		});
	});

	describe("actions.submit", () => {
		beforeEach(() => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const, maxTurns: 1, interactionType: "oneshot" },
			});
		});

		it("submits one-shot mail and returns feedback", async () => {
			const feedback = {
				content: "Good job!",
				objectiveResults: [{ text: "Write a clear email", grade: "A" as const }],
			};
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.submitOneShotMessage.mockResolvedValue({ turnCount: 1 });
			mockSessionService.completeSession.mockResolvedValue(feedback);

			const result = await actions.submit(
				createFormEvent({
					values: {
						sessionId: "789",
						message: "To: Maya\nSubject: Meeting\n\nHello Maya",
						clientMessageId: "mail-1",
						bodyHtml: '<div style="text-align: center; color: #d70015">Hello <b>Maya</b><script>alert(1)</script></div>',
					},
				}),
			);

			expect(result).toMatchObject({ success: true, turnCount: 1, feedback });
			expect(mockSessionService.submitOneShotMessage).toHaveBeenCalledWith(789, "To: Maya\nSubject: Meeting\n\nHello Maya", "mail-1", {
				maxTurns: 1,
				mailBodyHtml: '<div style="text-align: center">Hello Maya</div>',
			});
			expect(mockSessionService.completeSession).toHaveBeenCalledWith(789);
		});

		it("rejects submit for non-one-shot tasks", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: { ui: "discord" as const, maxTurns: 0, interactionType: "chat" } });

			const result = await actions.submit(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));

			expect(result).toMatchObject({ status: 400, data: { error: "Submit is only available for one-shot tasks" } });
			expect(mockSessionService.submitOneShotMessage).not.toHaveBeenCalled();
		});

		it("returns fail 403 when one-shot maximum turns are reached", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.submitOneShotMessage.mockRejectedValue(new Error("Maximum conversation turns reached"));

			const result = await actions.submit(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));

			expect(result).toMatchObject({ status: 403, data: { error: "Maximum conversation turns reached" } });
		});

		it("maps completeSession errors after one-shot submit", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.submitOneShotMessage.mockResolvedValue({ turnCount: 1 });
			mockSessionService.completeSession.mockRejectedValue(new Error("Session not found"));

			const result = await actions.submit(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));

			expect(result).toMatchObject({ status: 404, data: { error: "Session not found" } });
		});

		it("returns fail 500 for unexpected submit failures", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.submitOneShotMessage.mockRejectedValue({ error: "weird" });

			const result = await actions.submit(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));

			expect(result).toMatchObject({ status: 500, data: { error: "Failed to submit session" } });
		});
	});

	describe("actions.hint", () => {
		beforeEach(() => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
		});

		it("returns success with hints when called correctly", async () => {
			const mockHints = { hints: [{ text: "Test", translation: "Test" }] };
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue(mockHints);

			const result = await actions.hint(createFormEvent({ values: { sessionId: "123" } }));

			expect(result).toEqual({ success: true, ...mockHints });
			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123);
		});

		it("routes apple_mail hints to generateMailHint with the current draft", async () => {
			const mockMailHint = {
				mailHint: {
					subjectSuggestion: { text: "Meeting update" },
					nextSection: { title: "Closing", text: "Thank you for your time." },
					nextSentence: null,
					checklist: [],
				},
			};
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: { ui: "apple_mail" as const } });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateMailHint.mockResolvedValue(mockMailHint);

			const result = await actions.hint(
				createFormEvent({
					values: {
						sessionId: "123",
						to: "Maya Chen <maya@example.com>",
						subject: "Schedule",
						body: "Hello Maya,",
					},
				}),
			);

			expect(result).toEqual({ success: true, ...mockMailHint });
			expect(mockSessionService.generateMailHint).toHaveBeenCalledWith(123, {
				to: "Maya Chen <maya@example.com>",
				subject: "Schedule",
				body: "Hello Maya,",
			});
			expect(mockSessionService.generateHint).not.toHaveBeenCalled();
		});

		it.each([
			{
				name: "unauthenticated user",
				event: createFormEvent({ user: null, values: { sessionId: "123" } }),
				expected: { status: 401, data: { error: "Unauthorized" } },
			},
			{
				name: "invalid task id",
				event: createFormEvent({ taskId: "invalid", values: { sessionId: "123" } }),
				expected: { status: 400, data: { error: "Invalid task ID" } },
			},
			{
				name: "invalid session id",
				event: createFormEvent({ values: {} }),
				expected: { status: 400, data: { error: "Invalid session" } },
			},
		])("returns controlled failures for $name", async ({ event, expected }) => {
			const result = await actions.hint(event);
			expect(result).toMatchObject(expected);
		});

		it("returns 403 when ownership check fails", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue(null);
			const result = await actions.hint(createFormEvent({ values: { sessionId: "123" } }));
			expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
		});

		it("returns 500 when generateHint fails", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockRejectedValue(new Error("AI error"));

			const result = await actions.hint(createFormEvent({ values: { sessionId: "123" } }));
			expect(result).toMatchObject({ status: 500, data: { error: "Failed to generate hints" } });
		});
	});
});
