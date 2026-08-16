import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockArchiveService, mockNoteService, mockSessionService } = vi.hoisted(() => ({
	mockArchiveService: {
		listCompletedActivities: vi.fn(),
	},
	mockNoteService: {
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

	const mockUser = { id: "user_123", name: "Test User", activeLanguage: "en", nativeLanguage: "en" };

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
							notes: [{ id: 1, vocab: "decide", targetDefinition: "to make a choice", nativeDefinition: "决定" }],
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
			language: "es",
			vocab: "tomar una decisión",
			targetDefinition: "elegir qué hacer tras considerar las opciones",
			nativeDefinition: "作出决定",
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
				feedbackLanguage: "en",
				itemText: "tomar una decisión\nelegir qué hacer tras considerar las opciones\n作出决定",
				category: "vocabulary",
				question: "why",
				currentContext: "elegir qué hacer tras considerar las opciones\n作出决定",
			});
		});

		it("uses source-independent follow-up for a translation note", async () => {
			mockNoteService.getNote.mockResolvedValue({
				...mockNote,
				sourceSessionId: null,
				sourceTranslationAttemptId: 12,
				language: "es",
			});
			mockSessionService.followUpOnLearningContent.mockResolvedValue({ answer: "Translation explanation" });
			const result = await actions.followUp(createFormEvent({ values: { noteId: "42", question: "why" } }));
			expect(result).toEqual({ success: true, answer: "Translation explanation" });
			expect(mockSessionService.followUpOnLearningContent).toHaveBeenCalledWith(
				expect.objectContaining({
					learningLanguage: "es",
					itemText: "tomar una decisión\nelegir qué hacer tras considerar las opciones\n作出决定",
				}),
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
