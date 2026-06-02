import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockSessionService, mockNoteService } = vi.hoisted(() => ({
	mockDb: {
		query: {
			practiceSession: { findFirst: vi.fn() },
			task: { findFirst: vi.fn() },
			user: { findFirst: vi.fn() },
		},
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => []),
			})),
		})),
	},
	mockSessionService: {
		startSession: vi.fn(),
		sendMessage: vi.fn(),
		completeSession: vi.fn(),
		generateHint: vi.fn(),
		getSessionOrFail: vi.fn(),
		followUpOnFeedback: vi.fn(),
	},
	mockNoteService: {
		createNotesBatch: vi.fn(),
		validateAndCreateNoteFromSelection: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/session", () => mockSessionService);
vi.mock("$lib/server/feedback", () => ({
	followUpOnFeedback: mockSessionService.followUpOnFeedback,
}));
vi.mock("$lib/server/note", () => mockNoteService);

import { MAIL_AGENT_OPENING_MESSAGE } from "$lib/components/practice-ui/mail/constants";
import { CLIENT_MESSAGE_ID_MAX_LENGTH, MAIL_TEXT_MAX_LENGTH, PRACTICE_UI_TEXT_MAX_LENGTH, USER_LONG_TEXT_MAX_LENGTH } from "$lib/constants";
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
		values?: Record<string, string | string[]>;
	}) => {
		const formData = new FormData();
		for (const [key, value] of Object.entries(values)) {
			if (Array.isArray(value)) {
				for (const v of value) formData.append(key, v);
			} else {
				formData.append(key, value);
			}
		}
		return {
			request: { formData: vi.fn().mockResolvedValue(formData) },
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
				parent: async () => ({ avatarUrl: "https://gravatar.com/avatar/mockhash" }),
			} as any)) as { task: typeof mockTask; existingSession: { id: number } | null };

			expect(result.task).toEqual(mockTask);
			expect(result.existingSession).toBeDefined();
			expect(result.existingSession?.id).toBe(789);
			const sessionQuery = mockDb.query.practiceSession.findFirst.mock.calls[0]?.[0];
			expect(sessionQuery.orderBy({ startedAt: "startedAt", id: "id" }, { desc: (value: string) => `desc:${value}` })).toEqual([
				"desc:startedAt",
				"desc:id",
			]);
			expect(sessionQuery.with.messages.orderBy({ createdAt: "createdAt", id: "id" }, { asc: (value: string) => `asc:${value}` })).toEqual([
				"asc:createdAt",
				"asc:id",
			]);
		});

		it("returns null existingSession when no in-progress session", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			const result = (await load({
				params: { id: mockTaskId },
				locals: { user: mockUser },
				// Mock the parent function here as well
				parent: async () => ({ avatarUrl: "https://gravatar.com/avatar/mockhash" }),
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
				parent: async () => ({ avatarUrl: "https://gravatar.com/avatar/mockhash" }),
			} as any)) as { user: { name: string; timezone: string } };

			expect(result.user.name).toBe("Updated Name");
			expect(result.user.timezone).toBe("Asia/Shanghai");
		});

		it("redirects when user not authenticated", async () => {
			await expect(
				load({
					params: { id: mockTaskId },
					locals: { user: null },
				} as any),
			).rejects.toMatchObject({ status: 302, location: "/sign-in" });
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
				parent: async () => ({ avatarUrl: "https://gravatar.com/avatar/mockhash" }),
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

		it.each(["apple_mail", "reddit"] as const)("allows %s tasks", async (ui) => {
			const implementedTask = {
				...mockTask,
				template: { ui, maxTurns: 99, interactionType: "chat", agentStartsFirst: true },
			};
			mockDb.query.task.findFirst.mockResolvedValue(implementedTask);
			mockDb.query.practiceSession.findFirst.mockResolvedValue(null);

			const result = (await load({
				params: { id: mockTaskId },
				locals: { user: mockUser },
				parent: async () => ({ avatarUrl: "https://mock.com/avatar.png" }),
			} as any)) as { task: typeof implementedTask; existingSession: null };

			expect(result.task).toEqual(implementedTask);
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
				expected: { status: 302, location: "/sign-in" },
				redirect: true,
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
		])("returns controlled failures for $name", async ({ event, expected, setup, redirect }) => {
			setup?.();
			if (redirect) {
				await expect(actions.start(event as any)).rejects.toMatchObject(expected);
				expect(mockSessionService.startSession).not.toHaveBeenCalled();
				return;
			}

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

		it("sends Apple Mail messages through chat with sanitized body html metadata", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const, maxTurns: 3 },
				variant: { openingState: { emails: [] } },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.sendMessage.mockResolvedValue({ reply: "Thanks for your email.", turnCount: 1 });

			const result = await actions.send(
				createFormEvent({
					values: {
						sessionId: "789",
						message: "To: Maya\nSubject: Meeting\n\nHello Maya",
						clientMessageId: "mail-1",
						bodyHtml: '<div style="text-align: center; color: #d70015">Hello <b>Maya</b><script>alert(1)</script></div>',
					},
				}),
			);

			expect(result).toMatchObject({ success: true, reply: "Thanks for your email.", turnCount: 1 });
			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(
				789,
				"To: Maya\nSubject: Meeting\n\nHello Maya",
				"user_123",
				"mail-1",
				expect.objectContaining({
					hiddenUserMessage: false,
					maxTurns: 3,
					userMetadata: { mailBodyHtml: '<div style="text-align: center">Hello Maya</div>' },
					userDisplayContent: "To: Maya\nSubject: Meeting\n\nHello Maya",
					promptContent: expect.stringContaining("Learner email body layout:\n[align=center] Hello Maya"),
				}),
			);
		});

		it("passes learner display name to Apple Mail agent-first opening prompts", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const, maxTurns: 3 },
				variant: { openingState: { emails: [] } },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.sendMessage.mockResolvedValue({ reply: "Hello Test User,", turnCount: 0 });

			await actions.send(
				createFormEvent({
					values: {
						sessionId: "789",
						message: MAIL_AGENT_OPENING_MESSAGE,
						clientMessageId: "join-789",
					},
				}),
			);

			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(
				789,
				MAIL_AGENT_OPENING_MESSAGE,
				"user_123",
				"join-789",
				expect.objectContaining({
					hiddenUserMessage: true,
					maxTurns: 3,
					promptContent: expect.stringContaining("Learner profile display name: Test User."),
				}),
			);
			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(
				expect.any(Number),
				expect.any(String),
				expect.any(String),
				expect.any(String),
				expect.objectContaining({
					promptContent: expect.stringContaining("Use the task template, agent prompt, and scenario/opening-state context"),
				}),
			);
		});

		it("uses the latest profile name in Apple Mail prompt context", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const, maxTurns: 3 },
				variant: { openingState: { emails: [] } },
			});
			mockDb.query.user.findFirst.mockResolvedValue({ name: "Profile Name" });
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.sendMessage.mockResolvedValue({ reply: "Hello Profile Name,", turnCount: 0 });

			await actions.send(
				createFormEvent({
					user: { ...mockUser, name: "Stale Name" },
					values: {
						sessionId: "789",
						message: "*User joined the server*",
						clientMessageId: "join-789",
					},
				}),
			);

			expect(mockSessionService.sendMessage).toHaveBeenCalledWith(
				789,
				"*User joined the server*",
				"user_123",
				"join-789",
				expect.objectContaining({
					promptContent: expect.stringContaining("Learner profile display name: Profile Name."),
				}),
			);
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
				createFormEvent({ values: { sessionId: "789", message: "What did you like?", clientMessageId: "ao3-msg", threadTargetCommentId: "c1" } }),
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
					userMetadata: { thread: { commentId: "ao3-user-ao3-msg", targetCommentId: "c1", responderName: "ReaderA", mode: "reply" } },
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
				createFormEvent({ values: { sessionId: "789", message: "Hello", clientMessageId: "ao3-msg", threadTargetCommentId: "missing" } }),
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
							thread: { commentId: "ao3-user-ao3-msg", targetCommentId: "missing", responderName: "ReaderA", mode: "reply" },
						},
					},
				],
			});
			mockSessionService.sendMessage.mockResolvedValue({ reply: "Recovered", turnCount: 1 });

			const result = await actions.send(
				createFormEvent({ values: { sessionId: "789", message: "Hello again", clientMessageId: "ao3-msg", threadTargetCommentId: "missing" } }),
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
					userMetadata: { thread: { commentId: "ao3-user-ao3-msg", targetCommentId: "missing", responderName: "ReaderA", mode: "reply" } },
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

		it("rejects overlong non-mail messages before session lookup", async () => {
			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1) } }));

			expect(result).toMatchObject({ status: 400, data: { error: "Message is too long" } });
			expect(mockSessionService.getSessionOrFail).not.toHaveBeenCalled();
			expect(mockSessionService.sendMessage).not.toHaveBeenCalled();
		});

		it("rejects overlong client message IDs before task lookup", async () => {
			const result = await actions.send(
				createFormEvent({ values: { sessionId: "789", message: "Hello", clientMessageId: "x".repeat(CLIENT_MESSAGE_ID_MAX_LENGTH + 1) } }),
			);

			expect(result).toMatchObject({ status: 400, data: { error: "Client message ID is too long" } });
			expect(mockDb.query.task.findFirst).not.toHaveBeenCalled();
			expect(mockSessionService.getSessionOrFail).not.toHaveBeenCalled();
		});

		it("allows Apple Mail messages above the shared UI limit", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const, maxTurns: 3 },
				variant: { openingState: { emails: [] } },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.sendMessage.mockResolvedValue({ reply: "Thanks", turnCount: 1 });

			const message = "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1);
			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message, bodyHtml: `<div>${message}</div>` } }));

			expect(result).toMatchObject({ success: true });
			expect(mockSessionService.sendMessage).toHaveBeenCalled();
		});

		it("allows Apple Mail messages at the body limit even when headers push the formatted message over the raw limit", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const, maxTurns: 3 },
				variant: { openingState: { emails: [] } },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.sendMessage.mockResolvedValue({ reply: "Thanks", turnCount: 1 });

			const body = "x".repeat(MAIL_TEXT_MAX_LENGTH);
			const message = `To: Maya Chen <maya@example.com>\nSubject: Update\n\n${body}`;
			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message, bodyHtml: `<div>${body}</div>` } }));

			expect(result).toMatchObject({ success: true });
			expect(mockSessionService.sendMessage).toHaveBeenCalled();
		});

		it("rejects Apple Mail messages over the mail limit", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				template: { ui: "apple_mail" as const, maxTurns: 3 },
				variant: { openingState: { emails: [] } },
			});

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "x".repeat(MAIL_TEXT_MAX_LENGTH + 1) } }));

			expect(result).toMatchObject({ status: 400, data: { error: "Message is too long" } });
			expect(mockSessionService.getSessionOrFail).not.toHaveBeenCalled();
		});

		it.each([
			{
				name: "unauthenticated user",
				event: () => createFormEvent({ user: null, values: { sessionId: "789", message: "Hello" } }),
				expected: { status: 302, location: "/sign-in" },
				redirect: true,
			},
			{
				name: "invalid task id",
				event: () => createFormEvent({ taskId: "invalid", values: { sessionId: "789", message: "Hello" } }),
				expected: { status: 400, data: { error: "Invalid task ID" } },
			},
			{
				name: "invalid session id",
				event: () => createFormEvent({ values: { sessionId: "invalid", message: "Hello" } }),
				expected: { status: 400, data: { error: "Invalid session ID" } },
			},
			{
				name: "empty message",
				event: () => createFormEvent({ values: { sessionId: "789", message: "" } }),
				expected: { status: 400, data: { error: "Message is required" } },
			},
		])("returns controlled failures for $name", async ({ event, expected, redirect }) => {
			const actualEvent = event();
			if (redirect) {
				await expect(actions.send(actualEvent)).rejects.toMatchObject(expected);
				expect(actualEvent.request.formData).not.toHaveBeenCalled();
				expect(mockDb.query.task.findFirst).not.toHaveBeenCalled();
				return;
			}

			const result = await actions.send(actualEvent);
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
			mockSessionService.completeSession.mockResolvedValue(undefined);

			const result = await actions.complete(createFormEvent({ values: { sessionId: "789" } }));

			expect(result).toMatchObject({ success: true });
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
				event: () => createFormEvent({ values: { sessionId: "invalid" } }),
				expected: { status: 400, data: { error: "Invalid session ID" } },
			},
			{
				name: "invalid task id",
				event: () => createFormEvent({ taskId: "invalid", values: { sessionId: "789" } }),
				expected: { status: 400, data: { error: "Invalid task ID" } },
			},
			{
				name: "unauthenticated user",
				event: () => createFormEvent({ user: null, values: { sessionId: "789" } }),
				expected: { status: 302, location: "/sign-in" },
				redirect: true,
			},
		])("returns controlled failures for $name", async ({ event, expected, redirect }) => {
			const actualEvent = event();
			if (redirect) {
				await expect(actions.complete(actualEvent)).rejects.toMatchObject(expected);
				expect(actualEvent.request.formData).not.toHaveBeenCalled();
				expect(mockSessionService.getSessionOrFail).not.toHaveBeenCalled();
				return;
			}

			const result = await actions.complete(actualEvent);
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
			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, undefined);
		});

		it("uses the shared hint generator for apple_mail after mail hints are removed", async () => {
			const mockHints = { hints: [{ text: "Test", translation: "Test" }] };
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: { ui: "apple_mail" as const } });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue(mockHints);

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

			expect(result).toEqual({ success: true, ...mockHints });
			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, undefined);
		});

		it.each([
			{
				name: "unauthenticated user",
				event: () => createFormEvent({ user: null, values: { sessionId: "123" } }),
				expected: { status: 302, location: "/sign-in" },
				redirect: true,
			},
			{
				name: "invalid task id",
				event: () => createFormEvent({ taskId: "invalid", values: { sessionId: "123" } }),
				expected: { status: 400, data: { error: "Invalid task ID" } },
			},
			{
				name: "invalid session id",
				event: () => createFormEvent({ values: {} }),
				expected: { status: 400, data: { error: "Invalid session" } },
			},
		])("returns controlled failures for $name", async ({ event, expected, redirect }) => {
			const actualEvent = event();
			if (redirect) {
				await expect(actions.hint(actualEvent)).rejects.toMatchObject(expected);
				expect(actualEvent.request.formData).not.toHaveBeenCalled();
				expect(mockSessionService.getSessionOrFail).not.toHaveBeenCalled();
				return;
			}

			const result = await actions.hint(actualEvent);
			expect(result).toMatchObject(expected);
		});

		it("returns 403 when ownership check fails", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue(null);
			const result = await actions.hint(createFormEvent({ values: { sessionId: "123" } }));
			expect(result).toMatchObject({ status: 403, data: { error: "Access denied" } });
		});

		it("passes valid contextPath array to generateHint", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: { maxTurns: 3 } });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			const mockHints = { hints: [{ text: "Reply", translation: "Reply" }] };
			mockSessionService.generateHint.mockResolvedValue(mockHints);
			const contextPath = JSON.stringify([{ author: "alice", text: "hello" }]);

			const result = await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath } }));

			expect(result).toEqual({ success: true, ...mockHints });
			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, [{ author: "alice", text: "hello" }]);
		});

		it("allows large hint contextPaths up to the task turn-based context budget", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: { maxTurns: 6 } });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ hints: [] });
			const contextPath = JSON.stringify(
				Array.from({ length: 6 }, (_, i) => ({
					author: `speaker-${i}`,
					text: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH),
				})),
			);

			expect(contextPath.length).toBeGreaterThan(USER_LONG_TEXT_MAX_LENGTH);

			await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath } }));

			expect(mockSessionService.generateHint).toHaveBeenCalledWith(
				123,
				expect.arrayContaining([expect.objectContaining({ author: "speaker-0", text: expect.stringMatching(/^x+$/) })]),
			);
		});

		it("ignores contextPath when it is not valid JSON", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: { maxTurns: 3 } });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ hints: [] });

			await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath: "not-json" } }));

			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, undefined);
		});

		it("ignores contextPath when it is a JSON object instead of array", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: { maxTurns: 3 } });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ hints: [] });

			await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath: '{"author":"a","text":"t"}' } }));

			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, undefined);
		});

		it("filters malformed contextPath entries before calling generateHint", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: { maxTurns: 3 } });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ hints: [] });
			const contextPath = JSON.stringify([{}, { author: 123, text: null }, { author: "alice", text: "hello" }]);

			await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath } }));

			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, [{ author: "alice", text: "hello" }]);
		});

		it("ignores contextPath when it is an empty string", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, template: { maxTurns: 3 } });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ hints: [] });

			await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath: "   " } }));

			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, undefined);
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
