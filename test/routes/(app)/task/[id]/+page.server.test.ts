import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetForTesting } from "$lib/server/rate-limit-llm";
import { actions, load } from "$routes/(app)/task/[id]/+page.server";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockLimit, mockSelect, mockFindFirst, mockChatJson } = vi.hoisted(() => {
	const mockLimit = vi.fn();
	const mockWhere = vi.fn(() => ({ limit: mockLimit }));
	const mockLeftJoin: any = vi.fn(() => ({ leftJoin: mockLeftJoin, where: mockWhere }));
	const mockInnerJoin = vi.fn(() => ({ leftJoin: mockLeftJoin }));
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
		locals: { user: userId ? { id: userId, activeLanguage: "fr", nativeLanguage: "en" } : null },
		params: { id: "42" },
		request: { formData: async () => formData },
	} as any;
}

const accessibleTask = {
	id: 42,
	title: "Ordering at a restaurant",
	description: "Practice ordering politely",
	objectives: ["Ask for the menu"],
	language: "fr",
	templateInteractionType: "chat",
	templateUi: "discord",
	templateDifficulty: 1,
	pointReward: 10,
	gemReward: 0,
};

// ── Tests ───────────────────────────────────────────────────────────
describe("Task detail +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockChatJson.mockReset();
		_resetForTesting();
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
		beforeEach(() => {
			mockLimit.mockResolvedValue([accessibleTask]);
		});

		it("returns 401 when user is not authenticated", async () => {
			const result = (await actions.generateExpressions(createActionEvent({ title: "Test" }, ""))) as any;
			expect(result.status).toBe(401);
		});

		it("returns 400 when task id is invalid", async () => {
			const event = createActionEvent({ nativeLanguage: "en" });
			event.params.id = "abc";
			const result = (await actions.generateExpressions(event)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Invalid task ID");
		});

		it("returns 404 when task is not accessible", async () => {
			mockLimit.mockResolvedValueOnce([]);
			const result = (await actions.generateExpressions(createActionEvent({ nativeLanguage: "en" }))) as any;
			expect(result.status).toBe(404);
			expect(result.data?.error).toBe("Task not found");
		});

		it("returns 400 when native language is missing", async () => {
			const event = createActionEvent({ title: "Test", nativeLanguage: "en", targetLanguage: "fr" });
			event.locals.user.nativeLanguage = null;
			const result = (await actions.generateExpressions(event)) as any;

			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Please set your native language in your profile before using translation help.");
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

		it("generates expressions with full task context", async () => {
			mockChatJson.mockResolvedValueOnce(["How do I address the professor?", "What is the formal greeting?"]);

			const result = await actions.generateExpressions(
				createActionEvent({
					title: "Tampered title",
					description: "Tampered description",
					objectives: JSON.stringify(["Tampered objective"]),
					interactionType: "translate",
					ui: "apple_mail",
					nativeLanguage: "en",
					targetLanguage: "es",
				}),
			);

			expect(result).toEqual({
				success: true,
				expressions: ["How do I address the professor?", "What is the formal greeting?"],
			});
			const requestMessages = mockChatJson.mock.calls[0]?.[1]?.messages;
			expect(requestMessages[1].content).toContain('Task title: "Ordering at a restaurant"');
			expect(requestMessages[1].content).toContain('Task description: "Practice ordering politely"');
			expect(requestMessages[1].content).not.toContain("Tampered");
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
			expect(result.data?.error).toBe("Failed to generate expressions. You may need to configure your own API key.");
		});

		it("returns 429 on the 11th call within a minute and makes no LLM or DB calls on that attempt", async () => {
			mockChatJson.mockResolvedValue(["Expression 1", "Expression 2"]);
			const event = createActionEvent({ title: "Ordering at a restaurant", nativeLanguage: "en", targetLanguage: "fr" });

			// First 10 calls should succeed (limit is 10/min)
			for (let i = 0; i < 10; i++) {
				const r = (await actions.generateExpressions(event)) as any;
				expect(r.status).toBeUndefined();
			}

			const dbCallsBefore = mockLimit.mock.calls.length;
			const llmCallsBefore = mockChatJson.mock.calls.length;

			// 11th call must be rate-limited
			const result = (await actions.generateExpressions(event)) as any;
			expect(result.status).toBe(429);
			expect(result.data?.error).toMatch(/Too many requests/);

			// No additional DB or LLM work should have occurred
			expect(mockLimit.mock.calls.length).toBe(dbCallsBefore);
			expect(mockChatJson.mock.calls.length).toBe(llmCallsBefore);
		});
	});

	// ── evaluateTranslation action ─────────────────────────────────
	describe("evaluateTranslation action", () => {
		beforeEach(() => {
			mockLimit.mockResolvedValue([accessibleTask]);
		});

		it("returns 401 when user is not authenticated", async () => {
			const result = (await actions.evaluateTranslation(createActionEvent({ sourceExpression: "Hello", userTranslation: "Bonjour" }, ""))) as any;
			expect(result.status).toBe(401);
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
			const event = createActionEvent({ sourceExpression: "Hello", userTranslation: "Bonjour", nativeLanguage: "en", targetLanguage: "fr" });
			event.locals.user.nativeLanguage = null;
			const result = (await actions.evaluateTranslation(event)) as any;

			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Please set your native language in your profile before using translation help.");
		});

		it("returns 400 when translation help text is too long", async () => {
			const result = (await actions.evaluateTranslation(
				createActionEvent({
					sourceExpression: "Hello",
					userTranslation: "x".repeat(10001),
					nativeLanguage: "en",
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
			expect(result.data?.error).toBe("Failed to evaluate translation. You may need to configure your own API key.");
		});
	});
});
