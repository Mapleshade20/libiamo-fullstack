import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockArchiveService, mockNoteService, mockSessionService } = vi.hoisted(() => ({
	mockArchiveService: {
		listCompletedActivities: vi.fn(),
	},
	mockNoteService: {
		updateNote: vi.fn(),
		deleteNote: vi.fn(),
		getNote: vi.fn(),
	},
	mockSessionService: {
		followUpOnFeedback: vi.fn(),
		followUpOnLearningContent: vi.fn(),
	},
}));

vi.mock("$lib/server/archive", () => mockArchiveService);
vi.mock("$lib/server/note", () => mockNoteService);
vi.mock("$lib/server/feedback", () => mockSessionService);
vi.mock("$lib/server/llm", () => ({
	llmErrorStatus: () => 500,
	llmErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "The AI request failed. Please try again."),
}));

import { actions, load } from "$routes/(app)/archive/+page.server";

describe("archive page server", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	const mockUser = { id: "user_123", name: "Test User", activeLanguage: "en" };

	const createFormEvent = ({ user = mockUser, values = {} }: { user?: typeof mockUser | null; values?: Record<string, string> } = {}) => {
		const formData = new FormData();
		for (const [key, value] of Object.entries(values)) {
			formData.append(key, value);
		}
		return {
			request: { formData: vi.fn().mockResolvedValue(formData) },
			locals: { user },
		} as any;
	};

	describe("load", () => {
		it("returns groups when authenticated", async () => {
			const mockGroups = [
				{
					label: "Today",
					activities: [
						{
							id: 1,
							taskTitle: "Ordering coffee",
							ui: "discord",
							completedAt: new Date(),
							notes: [{ id: 1, tutorComment: "Use past tense", keywords: ["past tense"], sourceContext: "I go yesterday." }],
						},
					],
				},
			];
			mockArchiveService.listCompletedActivities.mockResolvedValue(mockGroups);

			const result = await load({ locals: { user: mockUser } } as any);

			expect(result).toEqual({ groups: mockGroups });
			expect(mockArchiveService.listCompletedActivities).toHaveBeenCalledWith("user_123");
		});

		it("redirects when unauthenticated", async () => {
			await expect(load({ locals: { user: null } } as any)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
		});
	});

	describe("actions.update", () => {
		it("returns success when note is updated", async () => {
			mockNoteService.updateNote.mockResolvedValue({ id: 1, tutorComment: "Updated content" });

			const result = await actions.update(
				createFormEvent({
					values: { noteId: "42", tutorComment: "Updated content" },
				}),
			);

			expect(result).toEqual({ success: true, note: { id: 1, tutorComment: "Updated content" } });
			expect(mockNoteService.updateNote).toHaveBeenCalledWith(42, "user_123", {
				tutorComment: "Updated content",
				keywords: [],
			});
		});

		it("parses keywords from form data", async () => {
			mockNoteService.updateNote.mockResolvedValue({ id: 1, tutorComment: "Updated" });

			const result = await actions.update(
				createFormEvent({
					values: { noteId: "42", tutorComment: "Updated", keywords: "past tense,  , yesterday" },
				}),
			);

			expect(result).toEqual({ success: true, note: { id: 1, tutorComment: "Updated" } });
			expect(mockNoteService.updateNote).toHaveBeenCalledWith(42, "user_123", {
				tutorComment: "Updated",
				keywords: ["past tense", "yesterday"],
			});
		});

		it("redirects before parsing form data when unauthenticated", async () => {
			const event = createFormEvent({
				user: null,
				values: { noteId: "42", tutorComment: "Updated" },
			});

			await expect(actions.update(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
			expect(event.request.formData).not.toHaveBeenCalled();
			expect(mockNoteService.updateNote).not.toHaveBeenCalled();
		});

		it("returns fail 400 when noteId is invalid", async () => {
			const result = await actions.update(
				createFormEvent({
					values: { noteId: "not-a-number", tutorComment: "Updated" },
				}),
			);

			expect(result).toMatchObject({ status: 400, data: { error: "Invalid note ID" } });
		});

		it("returns fail 400 when tutorComment is missing", async () => {
			const result = await actions.update(createFormEvent({ values: { noteId: "42" } }));
			expect(result).toMatchObject({ status: 400, data: { error: "Content is required" } });
		});

		it("returns fail 400 when tutorComment is whitespace only", async () => {
			const result = await actions.update(createFormEvent({ values: { noteId: "42", tutorComment: "   " } }));
			expect(result).toMatchObject({ status: 400, data: { error: "Content is required" } });
		});

		it("returns fail 400 when tutorComment is too long", async () => {
			const result = await actions.update(createFormEvent({ values: { noteId: "42", tutorComment: "x".repeat(10001) } }));
			expect(result).toMatchObject({ status: 400, data: { error: "Content is too long" } });
			expect(mockNoteService.updateNote).not.toHaveBeenCalled();
		});

		it("returns fail 400 when keywords are too long", async () => {
			const result = await actions.update(createFormEvent({ values: { noteId: "42", tutorComment: "Updated", keywords: "x".repeat(10001) } }));
			expect(result).toMatchObject({ status: 400, data: { error: "Keywords are too long" } });
			expect(mockNoteService.updateNote).not.toHaveBeenCalled();
		});

		it("returns fail 404 when note not found", async () => {
			mockNoteService.updateNote.mockResolvedValue(undefined);
			const result = await actions.update(createFormEvent({ values: { noteId: "42", tutorComment: "Updated" } }));
			expect(result).toMatchObject({ status: 404, data: { error: "Note not found" } });
		});
	});

	describe("actions.delete", () => {
		it("returns success when note is deleted", async () => {
			mockNoteService.deleteNote.mockResolvedValue({ id: 1 });

			const result = await actions.delete(
				createFormEvent({
					values: { noteId: "42" },
				}),
			);

			expect(result).toEqual({ success: true, noteId: 1 });
			expect(mockNoteService.deleteNote).toHaveBeenCalledWith(42, "user_123");
		});

		it("redirects before parsing form data when unauthenticated", async () => {
			const event = createFormEvent({
				user: null,
				values: { noteId: "42" },
			});

			await expect(actions.delete(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
			expect(event.request.formData).not.toHaveBeenCalled();
			expect(mockNoteService.deleteNote).not.toHaveBeenCalled();
		});

		it("returns fail 400 when noteId is invalid", async () => {
			const result = await actions.delete(
				createFormEvent({
					values: { noteId: "abc" },
				}),
			);

			expect(result).toMatchObject({ status: 400, data: { error: "Invalid note ID" } });
		});

		it("returns fail 404 when note not found", async () => {
			mockNoteService.deleteNote.mockResolvedValue(undefined);
			const result = await actions.delete(createFormEvent({ values: { noteId: "42" } }));
			expect(result).toMatchObject({ status: 404, data: { error: "Note not found" } });
		});
	});

	describe("actions.followUp", () => {
		const mockNote = {
			id: 42,
			sourceSessionId: 99,
			userId: "user_123",
			tutorComment: "Incorrect verb conjugation",
		};

		it("returns success with answer when called correctly", async () => {
			mockNoteService.getNote.mockResolvedValue(mockNote);
			mockSessionService.followUpOnFeedback.mockResolvedValue({ answer: "Here is the explanation." });

			const result = await actions.followUp(
				createFormEvent({
					values: { noteId: "42", question: "why" },
				}),
			);

			expect(result).toEqual({ success: true, answer: "Here is the explanation." });
			expect(mockNoteService.getNote).toHaveBeenCalledWith(42, "user_123");
			expect(mockSessionService.followUpOnFeedback).toHaveBeenCalledWith({
				sessionId: 99,
				userId: "user_123",
				itemText: "Incorrect verb conjugation",
				category: "grammar",
				question: "why",
				currentContext: undefined,
			});
		});

		it("uses source-independent follow-up for a translation note", async () => {
			mockNoteService.getNote.mockResolvedValue({
				...mockNote,
				sourceSessionId: null,
				sourceTranslationAttemptId: 12,
				language: "es",
				sourceContext: "Learner translation context",
			});
			mockSessionService.followUpOnLearningContent.mockResolvedValue({ answer: "Translation explanation" });
			const result = await actions.followUp(createFormEvent({ values: { noteId: "42", question: "why" } }));
			expect(result).toEqual({ success: true, answer: "Translation explanation" });
			expect(mockSessionService.followUpOnLearningContent).toHaveBeenCalledWith(
				expect.objectContaining({ learningLanguage: "es", itemText: "Incorrect verb conjugation" }),
			);
		});

		it.each([
			{
				name: "unauthenticated user",
				event: () => createFormEvent({ user: null, values: { noteId: "42", question: "why" } }),
				expected: { status: 302, location: "/sign-in" },
				redirect: true,
			},
			{
				name: "invalid noteId",
				event: () => createFormEvent({ values: { noteId: "abc", question: "why" } }),
				expected: { status: 400, data: { error: "Invalid note ID" } },
			},
			{
				name: "missing question",
				event: () => createFormEvent({ values: { noteId: "42" } }),
				expected: { status: 400, data: { error: "Question is required" } },
			},
			{
				name: "whitespace question",
				event: () => createFormEvent({ values: { noteId: "42", question: "  " } }),
				expected: { status: 400, data: { error: "Question is required" } },
			},
			{
				name: "overlong question",
				event: () => createFormEvent({ values: { noteId: "42", question: "x".repeat(10001) } }),
				expected: { status: 400, data: { error: "Question is too long" } },
			},
		])("returns controlled failures for $name", async ({ event, expected, redirect }) => {
			const actualEvent = event();
			if (redirect) {
				await expect(actions.followUp(actualEvent)).rejects.toMatchObject(expected);
				expect(actualEvent.request.formData).not.toHaveBeenCalled();
				expect(mockNoteService.getNote).not.toHaveBeenCalled();
				return;
			}

			const result = await actions.followUp(actualEvent);
			expect(result).toMatchObject(expected);
		});

		it("returns 404 when note not found", async () => {
			mockNoteService.getNote.mockResolvedValue(null);

			const result = await actions.followUp(createFormEvent({ values: { noteId: "42", question: "why" } }));

			expect(result).toMatchObject({ status: 404, data: { error: "Note not found" } });
		});

		it("returns 500 when followUpOnFeedback fails", async () => {
			mockNoteService.getNote.mockResolvedValue(mockNote);
			mockSessionService.followUpOnFeedback.mockRejectedValue(new Error("AI error"));

			const result = await actions.followUp(createFormEvent({ values: { noteId: "42", question: "why" } }));

			expect(result).toMatchObject({ status: 500, data: { error: "AI error" } });
		});
	});
});
