import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockSessionService, mockNoteService, mockTaskContext } = vi.hoisted(() => {
	const submitMessage = vi.fn();
	return {
		mockDb: {
			query: {
				practiceSession: { findFirst: vi.fn() },
				task: { findFirst: vi.fn() },
				user: { findFirst: vi.fn() },
				agentResponseBatch: { findFirst: vi.fn() },
			},
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => []),
				})),
			})),
		},
		mockSessionService: {
			startSession: vi.fn(),
			submitMessage,
			completeSession: vi.fn(),
			generateHint: vi.fn(),
			getSessionOrFail: vi.fn(),
			followUpOnFeedback: vi.fn(),
			orderSessionMessagesChronologically: vi.fn((messages, operators) => [operators.asc(messages.createdAt), operators.asc(messages.id)]),
		},
		mockNoteService: {
			createNotesBatch: vi.fn(),
			validateAndCreateNoteFromSelection: vi.fn(),
		},
		mockTaskContext: {
			getTaskIdentity: vi.fn(),
			resolveRequestLineup: vi.fn(),
			findPracticeSession: vi.fn(),
		},
	};
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/session", () => mockSessionService);
vi.mock("$lib/server/feedback", () => ({
	followUpOnFeedback: mockSessionService.followUpOnFeedback,
}));
vi.mock("$lib/server/note", () => mockNoteService);
vi.mock("$lib/server/task-context", () => ({
	...mockTaskContext,
	parseTaskId: (value: string) => (/^[1-9]\d*$/.test(value) ? Number(value) : null),
}));

import {
	CLIENT_MESSAGE_ID_MAX_LENGTH,
	MAIL_TEXT_MAX_LENGTH,
	PRACTICE_UI_TEXT_MAX_LENGTH,
	USER_LONG_TEXT_MAX_LENGTH,
	USER_TEXT_MAX_LENGTH,
} from "$lib/constants";
import { actions, load } from "$routes/(app)/task/[id]/session/+page.server";

describe("session page server", () => {
	const context = { lineupId: 3, pinned: false };

	beforeEach(() => {
		vi.resetAllMocks();
		mockDb.query.user.findFirst.mockResolvedValue(null);
		mockTaskContext.resolveRequestLineup.mockResolvedValue(context);
		mockTaskContext.findPracticeSession.mockResolvedValue(null);
		mockTaskContext.getTaskIdentity.mockImplementation(async (id: number) => (id === 456 ? { id, interactionType: "chat", language: "en" } : null));
	});

	const mockUser = { id: "user_123", name: "Test User", activeLanguage: "en" };
	const mockTaskId = "456";
	const mockTask = {
		id: 456,
		interactionType: "chat" as const,
		title: "Test Task",
		language: "en",
		ui: "discord" as const,
		maxTurns: null as number | null,
		openingState: {},
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
			url: new URL(`https://libiamo.test/task/${taskId}/session`),
			cookies: { get: vi.fn().mockReturnValue(undefined) },
		} as any;
	};

	const loadEvent = (id = mockTaskId, user: typeof mockUser | null = mockUser) =>
		({
			params: { id },
			locals: { user },
			url: new URL(`https://libiamo.test/task/${id}/session`),
			cookies: { get: vi.fn().mockReturnValue(undefined) },
		}) as any;

	describe("load", () => {
		it("returns the task and the session its URL shows", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			mockTaskContext.findPracticeSession.mockResolvedValue({ id: 789 });
			mockDb.query.practiceSession.findFirst.mockResolvedValue({
				id: 789,
				status: "in_progress",
				messages: [],
			});
			const nextAgentWorkDueAt = new Date("2026-08-23T12:00:00.000Z");
			mockDb.query.agentResponseBatch.findFirst.mockResolvedValue({ dueAt: nextAgentWorkDueAt });

			const result = (await load(loadEvent())) as any;

			expect(mockTaskContext.findPracticeSession).toHaveBeenCalledWith("user_123", 456, context);
			expect(result.task).toEqual(mockTask);
			expect(result.existingSession?.id).toBe(789);
			// the earliest outstanding agent work drives the client's polling lifecycle
			expect(result.existingSession.nextAgentWorkDueAt).toEqual(nextAgentWorkDueAt);
			const batchQuery = mockDb.query.agentResponseBatch.findFirst.mock.calls[0]?.[0];
			expect(batchQuery.orderBy({ dueAt: "dueAt" }, { asc: (value: string) => `asc:${value}` })).toEqual(["asc:dueAt"]);
			const sessionQuery = mockDb.query.practiceSession.findFirst.mock.calls[0]?.[0];
			expect(sessionQuery.with.messages.orderBy({ createdAt: "createdAt", id: "id" }, { asc: (value: string) => `asc:${value}` })).toEqual([
				"asc:createdAt",
				"asc:id",
			]);
		});

		it("returns null existingSession when the learner has no session to show", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);

			const result = (await load(loadEvent())) as any;

			expect(result.existingSession).toBeNull();
			expect(mockDb.query.practiceSession.findFirst).not.toHaveBeenCalled();
		});

		it("reads the turn limit from the live task", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, maxTurns: 6 });
			expect(((await load(loadEvent())) as any).maxTurns).toBe(6);
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);
			expect(((await load(loadEvent())) as any).maxTurns).toBe(0);
		});

		it("does not duplicate parent user profile data", async () => {
			mockDb.query.task.findFirst.mockResolvedValue(mockTask);

			const result = (await load(loadEvent("456", { ...mockUser, name: "Stale Name" }))) as { user?: unknown };

			expect(result.user).toBeUndefined();
			expect(mockDb.query.user.findFirst).not.toHaveBeenCalled();
		});

		it("redirects when user not authenticated", async () => {
			await expect(load(loadEvent(mockTaskId, null))).rejects.toMatchObject({ status: 302, location: "/sign-in" });
		});

		it("returns 404 for invalid, missing, and translation task ids", async () => {
			await expect(load(loadEvent("invalid"))).rejects.toMatchObject({ status: 404 });
			mockDb.query.task.findFirst.mockResolvedValue(null);
			await expect(load(loadEvent("999"))).rejects.toMatchObject({ status: 404 });
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, interactionType: "translate", ui: "translator" });
			await expect(load(loadEvent())).rejects.toMatchObject({ status: 404 });
		});

		it.each(["apple_mail", "reddit", "imessage"] as const)("allows %s tasks", async (ui) => {
			const implementedTask = { ...mockTask, ui, maxTurns: 99 };
			mockDb.query.task.findFirst.mockResolvedValue(implementedTask);

			const result = (await load(loadEvent())) as any;

			expect(result.task).toEqual(implementedTask);
			expect(result.existingSession).toBeNull();
		});
	});

	describe("actions.start", () => {
		it("starts the session in the resolved lineup", async () => {
			mockSessionService.startSession.mockResolvedValue({ sessionId: 789 });

			const result = await actions.start(createFormEvent({}));

			expect(result).toMatchObject({ success: true, sessionId: 789 });
			expect(mockSessionService.startSession).toHaveBeenCalledWith(456, "user_123", 3);
		});

		it("maps Task not found from service to 404", async () => {
			mockSessionService.startSession.mockRejectedValue(new Error("Task not found"));
			const result = await actions.start(createFormEvent({}));
			expect(result).toMatchObject({ status: 404, data: { error: "Task not found" } });
		});

		it.each([
			{
				name: "invalid task id",
				taskId: "invalid",
				expected: { status: 404, data: { error: "Task not found" } },
			},
			{
				name: "unexpected service failure",
				setup: () => mockSessionService.startSession.mockRejectedValue(new Error("DB error")),
				expected: { status: 500, data: { error: "Failed to start session" } },
			},
			{
				name: "non-error payload from service",
				setup: () => mockSessionService.startSession.mockRejectedValue("String error"),
				expected: { status: 500, data: { error: "Failed to start session" } },
			},
		])("returns controlled failures for $name", async ({ taskId, expected, setup }) => {
			setup?.();
			const result = await actions.start(createFormEvent({ taskId }));
			expect(result).toMatchObject(expected);
		});

		it("redirects unauthenticated users before starting", async () => {
			await expect(actions.start(createFormEvent({ user: null }))).rejects.toMatchObject({ status: 302, location: "/sign-in" });
			expect(mockSessionService.startSession).not.toHaveBeenCalled();
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
			mockSessionService.submitMessage.mockResolvedValue({
				turnCount: 2,
				pending: true,
			});

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));

			expect(result).toMatchObject({
				success: true,
				turnCount: 2,
				pending: true,
			});
			expect(mockSessionService.submitMessage).toHaveBeenCalledWith(789, "Hello", "user_123", undefined, {});
		});

		it("passes clientMessageId through to submitMessage", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.submitMessage.mockResolvedValue({
				turnCount: 2,
				pending: true,
			});

			await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello", clientMessageId: "msg-123" } }));

			expect(mockSessionService.submitMessage).toHaveBeenCalledWith(789, "Hello", "user_123", "msg-123", {});
		});

		it("sends Apple Mail messages through chat with sanitized body html metadata", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				ui: "apple_mail" as const,
				maxTurns: 3,
				openingState: { emails: [] },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.submitMessage.mockResolvedValue({ turnCount: 1, pending: true });

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

			expect(result).toMatchObject({ success: true, pending: true, turnCount: 1 });
			expect(mockSessionService.submitMessage).toHaveBeenCalledWith(
				789,
				"To: Maya\nSubject: Meeting\n\nHello Maya",
				"user_123",
				"mail-1",
				// Only what the learner wrote is persisted: no prompt wrapper with names or layout instructions.
				{ userMetadata: { mailBodyHtml: '<div style="text-align: center">Hello Maya</div>' } },
			);
		});

		it("builds AO3 prompt metadata for a nested comment reply", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				ui: "ao3" as const,
				maxTurns: 4,
				openingState: {
					workTitle: "My Fic",
					authorName: "FicAuthor",
					previousComments: [{ id: "c1", username: "ReaderA", comment: "Great start!" }],
				},
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.submitMessage.mockResolvedValue({ turnCount: 1, pending: true });

			const result = await actions.send(
				createFormEvent({ values: { sessionId: "789", message: "What did you like?", clientMessageId: "ao3-msg", threadTargetCommentId: "c1" } }),
			);

			expect(result).toMatchObject({ success: true, pending: true });
			expect(mockSessionService.submitMessage).toHaveBeenCalledWith(
				789,
				"What did you like?",
				"user_123",
				"ao3-msg",
				expect.objectContaining({
					userDisplayContent: "What did you like?",
					userMetadata: { thread: { commentId: "ao3-user-ao3-msg", targetCommentId: "c1", responderName: "ReaderA", mode: "reply" } },
				}),
			);
		});

		it("rejects an invalid AO3 reply target", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				ui: "ao3" as const,
				maxTurns: 4,
				openingState: { workTitle: "My Fic", previousComments: [] },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockDb.query.practiceSession.findFirst.mockResolvedValue({ messages: [] });

			const result = await actions.send(
				createFormEvent({ values: { sessionId: "789", message: "Hello", clientMessageId: "ao3-msg", threadTargetCommentId: "missing" } }),
			);

			expect(result).toMatchObject({ status: 400, data: { error: "Invalid AO3 reply target" } });
			expect(mockSessionService.submitMessage).not.toHaveBeenCalled();
		});

		it("retries failed AO3 turns from persisted metadata even if the target no longer resolves", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				ui: "ao3" as const,
				maxTurns: 4,
				openingState: { workTitle: "My Fic", authorName: "FicAuthor", previousComments: [] },
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
			mockSessionService.submitMessage.mockResolvedValue({ turnCount: 1, pending: true });

			const result = await actions.send(
				createFormEvent({ values: { sessionId: "789", message: "Hello again", clientMessageId: "ao3-msg", threadTargetCommentId: "missing" } }),
			);

			expect(result).toMatchObject({ success: true, pending: true });
			expect(mockSessionService.submitMessage).toHaveBeenCalledWith(
				789,
				"Hello again",
				"user_123",
				"ao3-msg",
				expect.objectContaining({
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
			mockSessionService.submitMessage.mockResolvedValue({
				turnCount: 1,
				pending: true,
			});

			const result = await actions.send(
				createFormEvent({ user: { ...mockUser, activeLanguage: "fr" }, values: { sessionId: "789", message: "Hola" } }),
			);

			expect(result).toMatchObject({ success: true, pending: true });
			expect(mockSessionService.submitMessage).toHaveBeenCalledWith(789, "Hola", "user_123", undefined, {});
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
			expect(mockSessionService.submitMessage).not.toHaveBeenCalled();
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
				ui: "apple_mail" as const,
				maxTurns: 3,
				openingState: { emails: [] },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.submitMessage.mockResolvedValue({ turnCount: 1, pending: true });

			const message = "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1);
			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message, bodyHtml: `<div>${message}</div>` } }));

			expect(result).toMatchObject({ success: true });
			expect(mockSessionService.submitMessage).toHaveBeenCalled();
		});

		it("allows Apple Mail messages at the body limit even when headers push the formatted message over the raw limit", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				ui: "apple_mail" as const,
				maxTurns: 3,
				openingState: { emails: [] },
			});
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });
			mockSessionService.submitMessage.mockResolvedValue({ turnCount: 1, pending: true });

			const body = "x".repeat(MAIL_TEXT_MAX_LENGTH);
			const message = `To: Maya Chen <maya@example.com>\nSubject: Update\n\n${body}`;
			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message, bodyHtml: `<div>${body}</div>` } }));

			expect(result).toMatchObject({ success: true });
			expect(mockSessionService.submitMessage).toHaveBeenCalled();
		});

		it("rejects Apple Mail messages over the mail limit", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({
				...mockTask,
				ui: "apple_mail" as const,
				maxTurns: 3,
				openingState: { emails: [] },
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
			mockSessionService.submitMessage.mockRejectedValue(new Error(error));

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));
			expect(result).toMatchObject({ status, data: { error } });
		});

		it("returns 500 for unexpected non-Error failures", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.submitMessage.mockRejectedValue({ some: "object error" });

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));
			expect(result).toMatchObject({ status: 500, data: { error: "The AI request failed. Please try again." } });
		});

		it("returns 500 for unexpected Error failures", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 789,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.submitMessage.mockRejectedValue(new Error("Unexpected transport error"));

			const result = await actions.send(createFormEvent({ values: { sessionId: "789", message: "Hello" } }));
			expect(result).toMatchObject({ status: 500, data: { error: "Unexpected transport error" } });
		});

		it("returns fail 403 when maximum conversation turns reached", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, maxTurns: 5 });
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 789, userId: "user_123", taskId: 456 });

			mockSessionService.submitMessage.mockRejectedValue(new Error("Maximum conversation turns reached"));

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

		it("returns a content direction when called correctly", async () => {
			const mockHint = { contentHint: "Add the relevant date." };
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue(mockHint);

			const result = await actions.hint(createFormEvent({ values: { sessionId: "123" } }));

			expect(result).toEqual({ success: true, ...mockHint });
			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, expect.objectContaining({ mode: "content", contextPath: undefined }));
		});

		it("uses the shared hint generator for apple_mail after mail hints are removed", async () => {
			const mockHint = { contentHint: "Clarify the request." };
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, ui: "apple_mail" as const });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue(mockHint);

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

			expect(result).toEqual({ success: true, ...mockHint });
			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, expect.objectContaining({ mode: "content", contextPath: undefined }));
		});

		it("returns expression fragments and passes the draft and intended meaning", async () => {
			const mockHint = { phrases: ["j'ai vérifié", "le détail de facture"] };
			mockSessionService.getSessionOrFail.mockResolvedValue({ id: 123, userId: "user_123", taskId: 456 });
			mockSessionService.generateHint.mockResolvedValue(mockHint);

			const result = await actions.hint(
				createFormEvent({
					values: { sessionId: "123", mode: "expression", draft: "Bonjour", expression: "我已经检查过账单" },
				}),
			);

			expect(result).toEqual({ success: true, ...mockHint });
			expect(mockSessionService.generateHint).toHaveBeenCalledWith(
				123,
				expect.objectContaining({ mode: "expression", draft: "Bonjour", expression: "我已经检查过账单" }),
			);
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
			{
				name: "invalid hint mode",
				event: () => createFormEvent({ values: { sessionId: "123", mode: "polish" } }),
				expected: { status: 400, data: { error: "Invalid hint mode" } },
			},
			{
				name: "missing expression",
				event: () => createFormEvent({ values: { sessionId: "123", mode: "expression" } }),
				expected: { status: 400, data: { error: "Expression is required" } },
			},
			{
				name: "oversized draft",
				event: () => createFormEvent({ values: { sessionId: "123", draft: "x".repeat(USER_LONG_TEXT_MAX_LENGTH + 1) } }),
				expected: { status: 400, data: { error: "Draft is too long" } },
			},
			{
				name: "oversized expression",
				event: () => createFormEvent({ values: { sessionId: "123", mode: "expression", expression: "x".repeat(USER_TEXT_MAX_LENGTH + 1) } }),
				expected: { status: 400, data: { error: "Expression is too long" } },
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
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, maxTurns: 3 });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			const mockHint = { contentHint: "Reply to the selected comment." };
			mockSessionService.generateHint.mockResolvedValue(mockHint);
			const contextPath = JSON.stringify([{ author: "alice", text: "hello" }]);

			const result = await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath } }));

			expect(result).toEqual({ success: true, ...mockHint });
			expect(mockSessionService.generateHint).toHaveBeenCalledWith(
				123,
				expect.objectContaining({ mode: "content", contextPath: [{ author: "alice", text: "hello" }] }),
			);
		});

		it("allows large hint contextPaths up to the task turn-based context budget", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, maxTurns: 6 });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ contentHint: "Add context." });
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
				expect.objectContaining({
					mode: "content",
					contextPath: expect.arrayContaining([expect.objectContaining({ author: "speaker-0", text: expect.stringMatching(/^x+$/) })]),
				}),
			);
		});

		it("ignores contextPath when it is not valid JSON", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, maxTurns: 3 });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ contentHint: "Add context." });

			await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath: "not-json" } }));

			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, expect.objectContaining({ mode: "content", contextPath: undefined }));
		});

		it("ignores contextPath when it is a JSON object instead of array", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, maxTurns: 3 });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ contentHint: "Add context." });

			await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath: '{"author":"a","text":"t"}' } }));

			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, expect.objectContaining({ mode: "content", contextPath: undefined }));
		});

		it("filters malformed contextPath entries before calling generateHint", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, maxTurns: 3 });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ contentHint: "Add context." });
			const contextPath = JSON.stringify([{}, { author: 123, text: null }, { author: "alice", text: "hello" }]);

			await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath } }));

			expect(mockSessionService.generateHint).toHaveBeenCalledWith(
				123,
				expect.objectContaining({ mode: "content", contextPath: [{ author: "alice", text: "hello" }] }),
			);
		});

		it("ignores contextPath when it is an empty string", async () => {
			mockDb.query.task.findFirst.mockResolvedValue({ ...mockTask, maxTurns: 3 });
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockResolvedValue({ contentHint: "Add context." });

			await actions.hint(createFormEvent({ values: { sessionId: "123", contextPath: "   " } }));

			expect(mockSessionService.generateHint).toHaveBeenCalledWith(123, expect.objectContaining({ mode: "content", contextPath: undefined }));
		});

		it("returns 500 when generateHint fails", async () => {
			mockSessionService.getSessionOrFail.mockResolvedValue({
				id: 123,
				userId: "user_123",
				taskId: 456,
			});
			mockSessionService.generateHint.mockRejectedValue(new Error("AI error"));

			const result = await actions.hint(createFormEvent({ values: { sessionId: "123" } }));
			expect(result).toMatchObject({ status: 500, data: { error: "AI error" } });
		});
	});
});
