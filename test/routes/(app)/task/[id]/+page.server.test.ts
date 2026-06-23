import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { TrialQuotaExhaustedError } from "$lib/server/llm";
import { actions, load } from "$routes/(app)/task/[id]/+page.server";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockLimit, mockSelect, mockFindFirst, mockChatJson } = vi.hoisted(() => {
	const mockLimit = vi.fn();
	const mockWhere = vi.fn(() => ({ limit: mockLimit }));
	const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
	// from() returns a chainable that supports both innerJoin (task query) and where→limit (user query)
	const mockFrom = vi.fn(() => ({
		innerJoin: mockInnerJoin,
		where: mockWhere,
	}));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	const mockFindFirst = vi.fn();
	const mockChatJson = vi.fn();
	return { mockLimit, mockSelect, mockFindFirst, mockChatJson };
});

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
		query: {
			practiceSession: {
				findFirst: mockFindFirst,
			},
		},
	},
}));

vi.mock("$lib/server/llm", async (importOriginal) => {
	const actual = await importOriginal<typeof import("$lib/server/llm")>();
	return {
		...actual,
		chatJson: mockChatJson,
	};
});

// ── Helpers ─────────────────────────────────────────────────────────
function createActionEvent(entries: Record<string, string>, userId = "u1") {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.append(key, value);
	}
	return {
		locals: { user: userId ? { id: userId } : null },
		request: { formData: vi.fn().mockResolvedValue(formData) },
	} as any;
}

// ── Tests ───────────────────────────────────────────────────────────
describe("Task detail +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockChatJson.mockReset();
	});

	// ── Load ──────────────────────────────────────────────────────
	describe("load", () => {
		it("redirects when user is not authenticated", async () => {
			await expect(load({ locals: { user: null }, params: { id: "1" } } as any)).rejects.toMatchObject({
				status: 302,
				location: "/sign-in",
			});
		});

		it("returns 404 when task id is invalid", async () => {
			await expect(load({ locals: { user: { activeLanguage: "en" } }, params: { id: "abc" } } as any)).rejects.toMatchObject({
				status: 404,
				body: { message: "Task not found" },
			});
		});

		it("returns 404 when task query is empty", async () => {
			mockLimit.mockResolvedValueOnce([]);

			await expect(load({ locals: { user: { id: "u1", activeLanguage: "en" } }, params: { id: "42" } } as any)).rejects.toMatchObject({
				status: 404,
				body: { message: "Task not found" },
			});
			expect(mockFindFirst).not.toHaveBeenCalled();
		});

		it("returns task payload with latest session status and native language", async () => {
			const row = {
				id: 42,
				title: "Task title",
				templateUi: "discord",
				pointReward: 10,
			};
			mockLimit.mockResolvedValueOnce([row]);
			mockLimit.mockResolvedValueOnce([{ nativeLanguage: "es" }]);
			mockFindFirst.mockResolvedValueOnce({ status: "evaluated" });

			const result = await load({
				locals: { user: { id: "u1", activeLanguage: "en" } },
				params: { id: "42" },
			} as any);

			expect(mockSelect).toHaveBeenCalled();
			expect(mockFindFirst).toHaveBeenCalledTimes(1);
			expect(result).toEqual({
				task: {
					...row,
					sessionStatus: "evaluated",
				},
				nativeLanguage: "es",
			});
		});

		it("returns null nativeLanguage when user has not set one", async () => {
			const row = {
				id: 42,
				title: "Spanish task",
				language: "es",
				templateUi: "discord",
				pointReward: 10,
			};
			mockLimit.mockResolvedValueOnce([row]);
			mockLimit.mockResolvedValueOnce([{ nativeLanguage: null }]);
			mockFindFirst.mockResolvedValueOnce(null);

			const result = await load({
				locals: { user: { id: "u1", activeLanguage: "en" } },
				params: { id: "42" },
			} as any);

			expect(result).toEqual({
				task: {
					...row,
					sessionStatus: null,
				},
				nativeLanguage: null,
			});
		});

		it("returns null sessionStatus when latest session does not exist", async () => {
			const row = {
				id: 42,
				title: "Task title",
				templateUi: "discord",
				pointReward: 10,
			};
			mockLimit.mockResolvedValueOnce([row]);
			mockLimit.mockResolvedValueOnce([]);
			mockFindFirst.mockResolvedValueOnce(null);

			const result = await load({
				locals: { user: { id: "u1", activeLanguage: "en" } },
				params: { id: "42" },
			} as any);

			expect(result).toEqual({
				task: {
					...row,
					sessionStatus: null,
				},
				nativeLanguage: null,
			});
		});
	});

	// ── generateExpressions action ─────────────────────────────────
	describe("generateExpressions action", () => {
		it("redirects before parsing form data when user is not authenticated", async () => {
			const event = createActionEvent({ title: "Test" }, "");

			await expect(actions.generateExpressions(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
			expect(event.request.formData).not.toHaveBeenCalled();
			expect(mockChatJson).not.toHaveBeenCalled();
		});

		it("returns 400 when title is missing", async () => {
			const result = (await actions.generateExpressions(createActionEvent({}))) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing task title");
		});

		it("returns 400 when title is empty string", async () => {
			const result = (await actions.generateExpressions(createActionEvent({ title: "   " }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 when native language is missing", async () => {
			const result = (await actions.generateExpressions(createActionEvent({ title: "Test", targetLanguage: "fr" }))) as any;

			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Please set your native language in your profile before using translation help.");
		});

		it("returns 400 when task context is too long", async () => {
			const result = (await actions.generateExpressions(
				createActionEvent({
					title: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1),
					nativeLanguage: "en",
					targetLanguage: "fr",
				}),
			)) as any;

			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Task context is too long");
			expect(mockChatJson).not.toHaveBeenCalled();
		});

		it("generates expressions with minimal task context", async () => {
			mockChatJson.mockResolvedValueOnce(["Could I have the check?", "Where is the exit?"]);

			const result = await actions.generateExpressions(
				createActionEvent({
					title: "Ordering at a restaurant",
					nativeLanguage: "en",
					targetLanguage: "fr",
				}),
			);

			expect(result).toEqual({
				success: true,
				expressions: ["Could I have the check?", "Where is the exit?"],
			});
			expect(mockChatJson).toHaveBeenCalled();
		});

		it("allows useful expressions without BYOK when trial balance is available", async () => {
			mockChatJson.mockResolvedValueOnce(["Could I have the check?"]);

			const result = await actions.generateExpressions(
				createActionEvent({
					title: "Ordering at a restaurant",
					nativeLanguage: "en",
					targetLanguage: "fr",
				}),
			);

			expect(result).toEqual({ success: true, expressions: ["Could I have the check?"] });
			expect(mockChatJson).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "u1" }));
		});

		it("blocks useful expressions only when non-BYOK trial quota is exhausted", async () => {
			mockChatJson.mockRejectedValueOnce(new TrialQuotaExhaustedError(50_000, 0));

			const result = (await actions.generateExpressions(
				createActionEvent({
					title: "Ordering at a restaurant",
					nativeLanguage: "en",
					targetLanguage: "fr",
				}),
			)) as any;

			expect(result.status).toBe(402);
			expect(result.data?.quotaExhausted).toBe(true);
			expect(result.data?.quotaNotice?.href).toBe("/profile");
		});

		it("generates expressions with full task context", async () => {
			mockChatJson.mockResolvedValueOnce(["How do I address the professor?", "What is the formal greeting?"]);

			const result = await actions.generateExpressions(
				createActionEvent({
					title: "Writing a formal email",
					description: "Practice composing a formal email to a professor",
					objectives: JSON.stringify(["Use proper salutations", "Close politely"]),
					interactionType: "compose",
					ui: "apple_mail",
					nativeLanguage: "en",
					targetLanguage: "es",
				}),
			);

			expect(result).toEqual({
				success: true,
				expressions: ["How do I address the professor?", "What is the formal greeting?"],
			});
		});

		it("parses JSON inside markdown code fences", async () => {
			mockChatJson.mockResolvedValueOnce(["One expression", "Two expressions"]);

			const result = await actions.generateExpressions(createActionEvent({ title: "Test", nativeLanguage: "en", targetLanguage: "ja" }));

			expect(result).toEqual({
				success: true,
				expressions: ["One expression", "Two expressions"],
			});
		});

		it("falls back to line extraction for non-JSON response", async () => {
			mockChatJson.mockResolvedValueOnce(["Hello there", "How are you?", "Thank you"]);

			const result = await actions.generateExpressions(createActionEvent({ title: "Greetings", nativeLanguage: "en", targetLanguage: "fr" }));

			expect(result).toEqual({
				success: true,
				expressions: expect.any(Array),
			});
			expect((result as any).expressions.length).toBeGreaterThan(0);
		});

		it("returns 500 when LLM fails", async () => {
			mockChatJson.mockRejectedValueOnce(new Error("API error"));

			const result = (await actions.generateExpressions(createActionEvent({ title: "Test", nativeLanguage: "en", targetLanguage: "fr" }))) as any;

			expect(result.status).toBe(500);
			expect(result.data?.error).toBe("Failed to generate expressions. Check your trial balance or configure your own API key.");
		});
	});

	// ── evaluateTranslation action ─────────────────────────────────
	describe("evaluateTranslation action", () => {
		it("redirects before parsing form data when user is not authenticated", async () => {
			const event = createActionEvent({ sourceExpression: "Hello", userTranslation: "Bonjour" }, "");

			await expect(actions.evaluateTranslation(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
			expect(event.request.formData).not.toHaveBeenCalled();
			expect(mockChatJson).not.toHaveBeenCalled();
		});

		it("returns 400 when sourceExpression is missing", async () => {
			const result = (await actions.evaluateTranslation(createActionEvent({ userTranslation: "Bonjour" }))) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing source expression");
		});

		it("returns 400 when sourceExpression is empty", async () => {
			const result = (await actions.evaluateTranslation(createActionEvent({ sourceExpression: "   ", userTranslation: "Bonjour" }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 when userTranslation is missing", async () => {
			const result = (await actions.evaluateTranslation(createActionEvent({ sourceExpression: "Hello" }))) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing your translation");
		});

		it("returns 400 when userTranslation is empty", async () => {
			const result = (await actions.evaluateTranslation(createActionEvent({ sourceExpression: "Hello", userTranslation: "   " }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 when native language is missing", async () => {
			const result = (await actions.evaluateTranslation(
				createActionEvent({ sourceExpression: "Hello", userTranslation: "Bonjour", targetLanguage: "fr" }),
			)) as any;

			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Please set your native language in your profile before using translation help.");
		});

		it("returns 400 when translation help text is too long", async () => {
			const result = (await actions.evaluateTranslation(
				createActionEvent({
					sourceExpression: "Hello",
					userTranslation: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1),
					nativeLanguage: "en",
					targetLanguage: "fr",
				}),
			)) as any;

			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Translation help text is too long");
		});

		it("evaluates a perfect translation", async () => {
			mockChatJson.mockResolvedValueOnce({
				feedback: "Perfect! This is exactly how a native speaker would say it.",
				correction: "Bonjour",
			});

			const result = await actions.evaluateTranslation(
				createActionEvent({
					sourceExpression: "Hello",
					userTranslation: "Bonjour",
					nativeLanguage: "en",
					targetLanguage: "fr",
				}),
			);

			expect(result).toEqual({
				success: true,
				feedback: "Perfect! This is exactly how a native speaker would say it.",
				correction: "Bonjour",
			});
		});

		it("evaluates a translation with errors and provides correction", async () => {
			mockChatJson.mockResolvedValueOnce({
				feedback: "The word order is incorrect. In Spanish, adjectives usually come after nouns.",
				correction: "El gato negro",
			});

			const result = await actions.evaluateTranslation(
				createActionEvent({
					sourceExpression: "The black cat",
					userTranslation: "El negro gato",
					nativeLanguage: "en",
					targetLanguage: "es",
				}),
			);

			expect(result).toEqual({
				success: true,
				feedback: "The word order is incorrect. In Spanish, adjectives usually come after nouns.",
				correction: "El gato negro",
			});
		});

		it("parses JSON inside markdown code fences", async () => {
			mockChatJson.mockResolvedValueOnce({
				feedback: "Nice work!",
				correction: "¿Cómo estás?",
			});

			const result = await actions.evaluateTranslation(
				createActionEvent({
					sourceExpression: "How are you?",
					userTranslation: "¿Cómo estás?",
					nativeLanguage: "en",
					targetLanguage: "es",
				}),
			);

			expect(result).toEqual({
				success: true,
				feedback: "Nice work!",
				correction: "¿Cómo estás?",
			});
		});

		it("handles non-JSON LLM response gracefully", async () => {
			mockChatJson.mockResolvedValueOnce({
				feedback: "This is a great translation attempt! Keep practicing.",
				correction: "",
			});

			const result = await actions.evaluateTranslation(
				createActionEvent({
					sourceExpression: "Good morning",
					userTranslation: "Buenos días",
					nativeLanguage: "en",
					targetLanguage: "es",
				}),
			);

			expect(result).toEqual({
				success: true,
				feedback: "This is a great translation attempt! Keep practicing.",
				correction: "",
			});
		});

		it("returns 500 when LLM fails", async () => {
			mockChatJson.mockRejectedValueOnce(new Error("API timeout"));

			const result = (await actions.evaluateTranslation(
				createActionEvent({
					sourceExpression: "Hello",
					userTranslation: "Bonjour",
					nativeLanguage: "en",
					targetLanguage: "fr",
				}),
			)) as any;

			expect(result.status).toBe(500);
			expect(result.data?.error).toBe("Failed to evaluate translation. Check your trial balance or configure your own API key.");
		});
	});
});
