import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, load } from "$routes/(app)/translate/[id]/+page.server";

// ── Hoisted mocks ──────────────────────────────────────────────────
const { mockLimit, mockOrderBy, mockWhere, mockSelect, mockUpdate, mockSet, mockInsert, mockReturning } = vi.hoisted(() => {
	// Use `any` return types so mockResolvedValueOnce works flexibly
	const mockLimit = vi.fn<() => any>();
	const mockOrderBy = vi.fn<() => any>(() => ({ limit: mockLimit }));
	const mockWhere = vi.fn<() => any>(() => ({ orderBy: mockOrderBy, limit: mockLimit }));
	const mockFrom = vi.fn<() => any>(() => ({ where: mockWhere }));
	const mockSelect = vi.fn<() => any>(() => ({ from: mockFrom }));

	const mockReturning = vi.fn<() => any>();

	const mockUpdateWhere = vi.fn<() => any>(() => ({ returning: mockReturning }));
	const mockSet = vi.fn<() => any>();
	mockSet.mockReturnValue({ where: mockUpdateWhere });
	const mockUpdate = vi.fn<() => any>(() => ({ set: mockSet, where: mockUpdateWhere }));

	const mockValues = vi.fn<() => any>(() => ({ returning: mockReturning }));
	const mockInsert = vi.fn<() => any>(() => ({ values: mockValues }));

	return {
		mockLimit,
		mockOrderBy,
		mockWhere,
		mockSelect,
		mockUpdate,
		mockSet,
		mockInsert,
		mockReturning,
	};
});

const { mockCreateSingleTurnChat } = vi.hoisted(() => ({
	mockCreateSingleTurnChat: vi.fn(),
}));

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
		update: mockUpdate,
		insert: mockInsert,
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	template: {
		id: "id",
		titleBase: "titleBase",
		descriptionBase: "descriptionBase",
		shortObjectiveBase: "shortObjectiveBase",
		language: "language",
		materialsMd: "materialsMd",
		translationBase: "translationBase",
		difficulty: "difficulty",
		estimatedWords: "estimatedWords",
		pointReward: "pointReward",
		gemReward: "gemReward",
		interactionType: "interactionType",
		isActive: "isActive",
	},
	translationAttempt: {
		id: "id",
		userId: "userId",
		templateId: "templateId",
		translations: "translations",
		status: "status",
		evaluation: "evaluation",
		updatedAt: "updatedAt",
	},
}));

vi.mock("$lib/server/llm", () => ({
	createSingleTurnChat: mockCreateSingleTurnChat,
}));

// ── Helpers ────────────────────────────────────────────────────────
function createLoadEvent(params: { id: string }, user: any = { id: "u1", activeLanguage: "en" }) {
	return { locals: { user }, params } as any;
}

function createActionEvent(entries: Record<string, string>, params: { id: string }, userId = "u1") {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.append(key, value);
	}
	return {
		locals: { user: userId ? { id: userId } : null },
		params,
		request: { formData: async () => formData },
	} as any;
}

// ── Tests ──────────────────────────────────────────────────────────
describe("(app) translate/[id] +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCreateSingleTurnChat.mockReset();
	});

	// ── Load ──────────────────────────────────────────────────────
	describe("load", () => {
		it("redirects unauthenticated users", async () => {
			await expect(load(createLoadEvent({ id: "1" }, null))).rejects.toMatchObject({
				status: 302,
				location: "/sign-in",
			});
		});

		it("returns 404 for non-numeric id", async () => {
			await expect(load(createLoadEvent({ id: "abc" }))).rejects.toMatchObject({
				status: 404,
			});
		});

		it("returns 404 when template not found", async () => {
			// First query (template): where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([]);
			await expect(load(createLoadEvent({ id: "999" }))).rejects.toMatchObject({
				status: 404,
			});
		});

		it("returns template and latest attempt", async () => {
			const tpl = {
				id: 1,
				title: "Translate a Poem",
				description: "Desc",
				shortObjective: null,
				language: "en",
				materialsMd: null,
				translationBase: [["Hello world", "Goodbye world"]],
				difficulty: 2,
				estimatedWords: 100,
				pointReward: 10,
				gemReward: 1,
			};
			const attempt = {
				id: 42,
				translations: { "0-0": "你好世界", "0-1": "再见世界" },
				status: "draft",
				evaluation: null,
			};

			// First query (template select): where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([tpl]);
			// Second query (attempt select): where → orderBy → limit
			mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
			mockOrderBy.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([attempt]);

			const result = (await load(createLoadEvent({ id: "1" }))) as any;

			expect(result.template).toEqual(tpl);
			expect(result.attempt).toEqual(attempt);
		});

		it("returns null attempt when no draft exists", async () => {
			const tpl = {
				id: 2,
				title: "T",
				description: null,
				shortObjective: null,
				language: "en",
				materialsMd: null,
				translationBase: null,
				difficulty: 1,
				estimatedWords: null,
				pointReward: 5,
				gemReward: 0,
			};

			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([tpl]);
			mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
			mockOrderBy.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([]);

			const result = (await load(createLoadEvent({ id: "2" }))) as any;
			expect(result.attempt).toBeNull();
		});
	});

	// ── saveDraft action ──────────────────────────────────────────
	describe("saveDraft action", () => {
		it("redirects unauthenticated users", async () => {
			await expect(actions.saveDraft(createActionEvent({}, { id: "1" }, ""))).rejects.toMatchObject({
				status: 302,
			});
		});

		it("returns 400 for invalid template id", async () => {
			const result = (await actions.saveDraft(createActionEvent({ translations: "{}" }, { id: "abc" }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 for missing translations", async () => {
			const result = (await actions.saveDraft(createActionEvent({}, { id: "1" }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 for invalid JSON", async () => {
			const result = (await actions.saveDraft(createActionEvent({ translations: "not-json" }, { id: "1" }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 for non-numeric attemptId", async () => {
			const result = (await actions.saveDraft(createActionEvent({ translations: '{"0-0":"hello"}', attemptId: "abc" }, { id: "1" }))) as any;
			expect(result.status).toBe(400);
		});

		it("throws 403 when attemptId update returns empty (not found or not owned)", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ id: 1 }]);
			// upsertAttempt update path: returning resolves to empty array
			mockReturning.mockResolvedValueOnce([]);
			await expect(actions.saveDraft(createActionEvent({ translations: '{"0-0":"hello"}', attemptId: "99" }, { id: "1" }))).rejects.toMatchObject({
				status: 403,
				body: { message: "Attempt not found or not owned by user" },
			});
		});

		it("returns 404 when template not found", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([]);
			const result = (await actions.saveDraft(createActionEvent({ translations: '{"0-0":"hello"}' }, { id: "999" }))) as any;
			expect(result.status).toBe(404);
		});

		it("updates existing draft when attemptId provided", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ id: 1 }]);
			mockReturning.mockResolvedValueOnce([{ id: 42 }]);
			const result = await actions.saveDraft(createActionEvent({ translations: '{"0-0":"hello"}', attemptId: "42" }, { id: "1" }));
			expect(result).toEqual({ success: true });
			expect(mockSet).toHaveBeenCalled();
		});

		it("creates new draft when no attemptId", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ id: 1 }]);
			mockReturning.mockResolvedValueOnce([{ id: 1 }]);
			const result = await actions.saveDraft(createActionEvent({ translations: '{"0-0":"hello"}' }, { id: "1" }));
			expect(result).toEqual({ success: true });
			expect(mockInsert).toHaveBeenCalled();
		});
	});

	// ── submit action ─────────────────────────────────────────────
	describe("submit action", () => {
		it("redirects unauthenticated users", async () => {
			await expect(actions.submit(createActionEvent({}, { id: "1" }, ""))).rejects.toMatchObject({
				status: 302,
			});
		});

		it("returns 400 for invalid template id", async () => {
			const result = (await actions.submit(createActionEvent({ translations: "{}" }, { id: "abc" }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 for missing translations", async () => {
			const result = (await actions.submit(createActionEvent({}, { id: "1" }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 for invalid JSON translations", async () => {
			const result = (await actions.submit(createActionEvent({ translations: "bad" }, { id: "1" }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 for non-numeric attemptId", async () => {
			const result = (await actions.submit(createActionEvent({ translations: '{"0-0":"hello"}', attemptId: "abc" }, { id: "1" }))) as any;
			expect(result.status).toBe(400);
		});

		it("throws 403 when attemptId update returns empty (not found or not owned)", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello"]], language: "fr" }]);
			// upsertAttempt update path: returning resolves to empty array
			mockReturning.mockResolvedValueOnce([]);
			await expect(actions.submit(createActionEvent({ translations: '{"0-0":"hello"}', attemptId: "99" }, { id: "1" }))).rejects.toMatchObject({
				status: 403,
				body: { message: "Attempt not found or not owned by user" },
			});
		});

		it("returns 404 when template not found", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([]);
			const result = (await actions.submit(createActionEvent({ translations: '{"0-0":"hello"}' }, { id: "999" }))) as any;
			expect(result.status).toBe(404);
		});

		it("evaluates and marks as evaluated on success", async () => {
			const translations = { "0-0": "Bonjour le monde", "0-1": "Au revoir mon ami" };
			const evaluation = {
				overallScore: "A",
				overallFeedback: "Great job",
				highlights: [
					{ key: "0-0", type: "good", feedback: "Perfect" },
					{ key: "0-1", type: "good", feedback: "Correct" },
				],
			};

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello world, how are you", "Goodbye my dear friend"]], language: "fr" }]);

			// Insert (new attempt, no attemptId)
			mockReturning.mockResolvedValueOnce([{ id: 99 }]);

			// LLM returns valid JSON evaluation
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: JSON.stringify(evaluation) },
			});

			const result = await actions.submit(createActionEvent({ translations: JSON.stringify(translations) }, { id: "1" }));

			expect(result).toEqual({ success: true });
			expect(mockCreateSingleTurnChat).toHaveBeenCalled();
			// The final update sets status to "evaluated"
			expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "evaluated", evaluation }));
		});

		it("returns 500 when LLM evaluation fails", async () => {
			const translations = { "0-0": "Bonjour le monde" };

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello world, how are you"]], language: "fr" }]);

			// Insert
			mockReturning.mockResolvedValueOnce([{ id: 100 }]);

			// LLM throws
			mockCreateSingleTurnChat.mockRejectedValueOnce(new Error("API timeout"));

			const result = (await actions.submit(createActionEvent({ translations: JSON.stringify(translations) }, { id: "1" }))) as any;

			expect(result.status).toBe(500);
			expect(result.data?.error).toBe("Evaluation failed. Please try again.");
		});

		it("marks as submitted when template has no translationBase", async () => {
			const translations = { "0-0": "Hola" };

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: null, language: "es" }]);

			// Insert
			mockReturning.mockResolvedValueOnce([{ id: 101 }]);

			const result = await actions.submit(createActionEvent({ translations: JSON.stringify(translations) }, { id: "1" }));

			expect(result).toEqual({ success: true });
			expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "submitted" }));
		});

		it("handles LLM response with markdown fences", async () => {
			const translations = { "0-0": "Ciao mondo, come stai" };
			const evaluation = { overallScore: "B", overallFeedback: "Decent" };

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello world, how are you"]], language: "it" }]);
			mockReturning.mockResolvedValueOnce([{ id: 102 }]);

			// LLM wraps JSON in markdown fences
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: `\`\`\`json\n${JSON.stringify(evaluation)}\n\`\`\`` },
			});

			const result = await actions.submit(createActionEvent({ translations: JSON.stringify(translations) }, { id: "1" }));

			expect(result).toEqual({ success: true });
			expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "evaluated" }));
		});

		it("handles LLM returning non-JSON plain text (catch block)", async () => {
			const translations = { "0-0": "Bonjour le monde" };

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello world, how are you"]], language: "fr" }]);

			// Insert (no attemptId)
			mockReturning.mockResolvedValueOnce([{ id: 103 }]);

			// LLM returns plain text, not JSON
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: "The translations look mostly good but need some minor corrections." },
			});

			const result = await actions.submit(createActionEvent({ translations: JSON.stringify(translations) }, { id: "1" }));

			expect(result).toEqual({ success: true });
			// Should still be evaluated, but with overallFeedback containing the raw text
			expect(mockSet).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "evaluated",
					evaluation: { overallFeedback: "The translations look mostly good but need some minor corrections." },
				}),
			);
		});

		it("updates existing attempt when attemptId provided (no insert)", async () => {
			const translations = { "0-0": "Hola mundo, cómo estás hoy" };

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello world, how are you today"]], language: "es" }]);

			// Update path returning (scoped update with userId + templateId)
			mockReturning.mockResolvedValueOnce([{ id: 55 }]);

			// LLM returns valid evaluation
			const evaluation = { overallScore: "A", overallFeedback: "Perfect" };
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: JSON.stringify(evaluation) },
			});

			const result = await actions.submit(createActionEvent({ translations: JSON.stringify(translations), attemptId: "55" }, { id: "1" }));

			expect(result).toEqual({ success: true });
			// Should NOT have called insert
			expect(mockInsert).not.toHaveBeenCalled();
			// Should have called set for the initial draft save AND the final evaluated update
			expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "evaluated", evaluation }));
		});

		// ── Short sentence filtering ──
		it("filters out short sentences (le 3 words) from evaluation", async () => {
			const translations = { "0-0": "Hi", "0-1": "Bonjour le monde" };

			// Template with one short sentence ("Hello") and one normal ("Goodbye world, it was nice")
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello", "Goodbye world, it was nice"]], language: "fr" }]);
			mockReturning.mockResolvedValueOnce([{ id: 200 }]);

			const evaluation = { overallScore: "A", overallFeedback: "Good" };
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: JSON.stringify(evaluation) },
			});

			await actions.submit(createActionEvent({ translations: JSON.stringify(translations) }, { id: "1" }));

			// Verify the LLM was called but only with non-short sentences
			expect(mockCreateSingleTurnChat).toHaveBeenCalled();
			const callArgs = mockCreateSingleTurnChat.mock.calls[0][0];
			const userMessage = callArgs.userMessage as string;
			// Should NOT contain the short sentence "Hello"
			expect(userMessage).not.toContain("[0-0] Hello");
			// Should contain the normal sentence
			expect(userMessage).toContain("Goodbye world, it was nice");
		});

		it("filters out short sentences (le 20 chars) from evaluation", async () => {
			const translations = { "0-0": "Ok", "0-1": "This is a longer sentence that needs translation" };

			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([
				{ translationBase: [["Dear Mr. Smith", "This is a longer sentence that needs translation"]], language: "fr" },
			]);
			mockReturning.mockResolvedValueOnce([{ id: 201 }]);

			const evaluation = { overallScore: "B", overallFeedback: "Okay" };
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: JSON.stringify(evaluation) },
			});

			await actions.submit(createActionEvent({ translations: JSON.stringify(translations) }, { id: "1" }));

			const callArgs = mockCreateSingleTurnChat.mock.calls[0][0];
			const userMessage = callArgs.userMessage as string;
			// "Dear Mr. Smith" is 14 chars, should be filtered
			expect(userMessage).not.toContain("Dear Mr. Smith");
			expect(userMessage).toContain("This is a longer sentence");
		});

		it("still marks as evaluated when all sentences are short", async () => {
			const translations = { "0-0": "Hi" };

			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hi"]], language: "fr" }]);
			mockReturning.mockResolvedValueOnce([{ id: 202 }]);

			const result = await actions.submit(createActionEvent({ translations: JSON.stringify(translations) }, { id: "1" }));

			// Should succeed without calling LLM (no evaluable passages)
			expect(result).toEqual({ success: true });
			expect(mockCreateSingleTurnChat).not.toHaveBeenCalled();
			expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "evaluated" }));
		});
	});

	// ── generateModelTranslation action ───────────────────────────
	describe("generateModelTranslation action", () => {
		it("redirects unauthenticated users", async () => {
			await expect(actions.generateModelTranslation(createActionEvent({}, { id: "1" }, ""))).rejects.toMatchObject({
				status: 302,
			});
		});

		it("returns 400 for invalid template id", async () => {
			const result = (await actions.generateModelTranslation(createActionEvent({}, { id: "abc" }))) as any;
			expect(result.status).toBe(400);
		});

		it("returns 404 when template has no translationBase", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: null, language: "fr" }]);
			const result = (await actions.generateModelTranslation(createActionEvent({}, { id: "1" }))) as any;
			expect(result.status).toBe(404);
		});

		it("returns 404 when template not found", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([]);
			const result = (await actions.generateModelTranslation(createActionEvent({}, { id: "999" }))) as any;
			expect(result.status).toBe(404);
		});

		it("returns model translations on success", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello", "Goodbye"]], language: "fr" }]);

			const modelTranslations = { "0-0": "Bonjour", "0-1": "Au revoir" };
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: JSON.stringify(modelTranslations) },
			});

			const result = await actions.generateModelTranslation(createActionEvent({}, { id: "1" }));
			expect(result).toEqual({ success: true, modelTranslations });
		});

		it("handles JSON wrapped in markdown fences", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hi"]], language: "es" }]);

			const modelTranslations = { "0-0": "Hola" };
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: `\`\`\`json\n${JSON.stringify(modelTranslations)}\n\`\`\`` },
			});

			const result = await actions.generateModelTranslation(createActionEvent({}, { id: "1" }));
			expect(result).toEqual({ success: true, modelTranslations });
		});

		it("returns 500 when LLM fails", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello"]], language: "fr" }]);

			mockCreateSingleTurnChat.mockRejectedValueOnce(new Error("API error"));

			const result = (await actions.generateModelTranslation(createActionEvent({}, { id: "1" }))) as any;
			expect(result.status).toBe(500);
			expect(result.data?.error).toBe("Failed to generate model translation. You may need to configure your own API key.");
		});

		it("returns 500 when LLM response is not valid JSON", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello"]], language: "fr" }]);

			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: "not valid json at all" },
			});

			const result = (await actions.generateModelTranslation(createActionEvent({}, { id: "1" }))) as any;
			expect(result.status).toBe(500);
		});
	});

	// ── explainFeedback action ────────────────────────────────────
	describe("explainFeedback action", () => {
		it("redirects unauthenticated users", async () => {
			await expect(actions.explainFeedback(createActionEvent({}, { id: "1" }, ""))).rejects.toMatchObject({
				status: 302,
			});
		});

		it("returns 400 when sourceSentence is missing", async () => {
			const result = (await actions.explainFeedback(
				createActionEvent(
					{
						userTranslation: "hola",
						feedback: "wrong word",
						language: "es",
					},
					{ id: "1" },
				),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing source sentence");
		});

		it("returns 400 when userTranslation is missing", async () => {
			const result = (await actions.explainFeedback(
				createActionEvent(
					{
						sourceSentence: "Hello",
						feedback: "wrong word",
						language: "es",
					},
					{ id: "1" },
				),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing user translation");
		});

		it("returns 400 when feedback is missing", async () => {
			const result = (await actions.explainFeedback(
				createActionEvent(
					{
						sourceSentence: "Hello",
						userTranslation: "hola",
						language: "es",
					},
					{ id: "1" },
				),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing feedback");
		});

		it("returns 400 when language is missing", async () => {
			const result = (await actions.explainFeedback(
				createActionEvent(
					{
						sourceSentence: "Hello",
						userTranslation: "hola",
						feedback: "wrong word",
					},
					{ id: "1" },
				),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing language");
		});

		it("returns explanation on success", async () => {
			const explanation = "## What went wrong\n\nThe verb form is incorrect...";
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: explanation },
			});

			const result = await actions.explainFeedback(
				createActionEvent(
					{
						sourceSentence: "I go to school",
						userTranslation: "Je aller à l'école",
						feedback: "'aller' should be conjugated as 'vais'",
						language: "fr",
					},
					{ id: "1" },
				),
			);

			expect(result).toEqual({ success: true, explanation });
			expect(mockCreateSingleTurnChat).toHaveBeenCalled();
		});

		it("returns 500 when LLM fails", async () => {
			mockCreateSingleTurnChat.mockRejectedValueOnce(new Error("API timeout"));

			const result = (await actions.explainFeedback(
				createActionEvent(
					{
						sourceSentence: "Hello",
						userTranslation: "Bonjour",
						feedback: "Fine but informal",
						language: "fr",
					},
					{ id: "1" },
				),
			)) as any;

			expect(result.status).toBe(500);
			expect(result.data?.error).toBe("Failed to generate explanation. You may need to configure your own API key.");
		});
	});

	// ── translateSentence action ──────────────────────────────────
	describe("translateSentence action", () => {
		it("redirects unauthenticated users", async () => {
			await expect(actions.translateSentence(createActionEvent({}, { id: "1" }, ""))).rejects.toMatchObject({
				status: 302,
			});
		});

		it("returns 400 when sourceSentence is missing", async () => {
			const result = (await actions.translateSentence(
				createActionEvent({ language: "fr" }, { id: "1" }),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing source sentence");
		});

		it("returns 400 when sourceSentence is empty", async () => {
			const result = (await actions.translateSentence(
				createActionEvent({ sourceSentence: "   ", language: "fr" }, { id: "1" }),
			)) as any;
			expect(result.status).toBe(400);
		});

		it("returns 400 when language is missing", async () => {
			const result = (await actions.translateSentence(
				createActionEvent({ sourceSentence: "Hello" }, { id: "1" }),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing language");
		});

		it("returns translation on success", async () => {
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: "Bonjour le monde" },
			});

			const result = await actions.translateSentence(
				createActionEvent({ sourceSentence: "Hello world", language: "fr" }, { id: "1" }),
			);

			expect(result).toEqual({ success: true, translation: "Bonjour le monde" });
			expect(mockCreateSingleTurnChat).toHaveBeenCalled();
			const callArgs = mockCreateSingleTurnChat.mock.calls[0][0];
			expect(callArgs.systemPrompt).toContain("Français");
			expect(callArgs.userMessage).toBe("Hello world");
		});

		it("trims whitespace from translation", async () => {
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: "  ¡Hola!  " },
			});

			const result = await actions.translateSentence(
				createActionEvent({ sourceSentence: "Hi", language: "es" }, { id: "1" }),
			);

			expect(result).toEqual({ success: true, translation: "¡Hola!" });
		});

		it("returns 500 when LLM fails", async () => {
			mockCreateSingleTurnChat.mockRejectedValueOnce(new Error("API timeout"));

			const result = (await actions.translateSentence(
				createActionEvent({ sourceSentence: "Hello", language: "fr" }, { id: "1" }),
			)) as any;

			expect(result.status).toBe(500);
			expect(result.data?.error).toBe("Failed to translate sentence. You may need to configure your own API key.");
		});
	});

	// ── askTutor action ───────────────────────────────────────────
	describe("askTutor action", () => {
		it("redirects unauthenticated users", async () => {
			await expect(actions.askTutor(createActionEvent({}, { id: "1" }, ""))).rejects.toMatchObject({
				status: 302,
			});
		});

		it("returns 400 when sourceSentence is missing", async () => {
			const result = (await actions.askTutor(
				createActionEvent(
					{ userTranslation: "hola", feedback: "wrong", question: "why?", language: "es" },
					{ id: "1" },
				),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing source sentence");
		});

		it("returns 400 when userTranslation is missing", async () => {
			const result = (await actions.askTutor(
				createActionEvent(
					{ sourceSentence: "Hello", feedback: "wrong", question: "why?", language: "es" },
					{ id: "1" },
				),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing user translation");
		});

		it("returns 400 when feedback is missing", async () => {
			const result = (await actions.askTutor(
				createActionEvent(
					{ sourceSentence: "Hello", userTranslation: "hola", question: "why?", language: "es" },
					{ id: "1" },
				),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing feedback");
		});

		it("returns 400 when question is missing", async () => {
			const result = (await actions.askTutor(
				createActionEvent(
					{ sourceSentence: "Hello", userTranslation: "hola", feedback: "wrong", language: "es" },
					{ id: "1" },
				),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing question");
		});

		it("returns 400 when language is missing", async () => {
			const result = (await actions.askTutor(
				createActionEvent(
					{ sourceSentence: "Hello", userTranslation: "hola", feedback: "wrong", question: "why?" },
					{ id: "1" },
				),
			)) as any;
			expect(result.status).toBe(400);
			expect(result.data?.error).toBe("Missing language");
		});

		it("returns answer on success", async () => {
			const answer = "The verb should be conjugated because...";
			mockCreateSingleTurnChat.mockResolvedValueOnce({
				reply: { content: answer },
			});

			const result = await actions.askTutor(
				createActionEvent(
					{
						sourceSentence: "I eat",
						userTranslation: "Je mange",
						feedback: "Perfect!",
						question: "Why is it 'mange' and not 'manges'?",
						language: "fr",
					},
					{ id: "1" },
				),
			);

			expect(result).toEqual({ success: true, answer });
			expect(mockCreateSingleTurnChat).toHaveBeenCalled();
			const callArgs = mockCreateSingleTurnChat.mock.calls[0][0];
			expect(callArgs.systemPrompt).toContain("Français");
			expect(callArgs.userMessage).toContain("I eat");
			expect(callArgs.userMessage).toContain("Je mange");
			expect(callArgs.userMessage).toContain("Perfect!");
			expect(callArgs.userMessage).toContain("Why is it");
		});

		it("returns 500 when LLM fails", async () => {
			mockCreateSingleTurnChat.mockRejectedValueOnce(new Error("API error"));

			const result = (await actions.askTutor(
				createActionEvent(
					{
						sourceSentence: "Hello",
						userTranslation: "Bonjour",
						feedback: "Good",
						question: "Is there a better word?",
						language: "fr",
					},
					{ id: "1" },
				),
			)) as any;

			expect(result.status).toBe(500);
			expect(result.data?.error).toBe("Failed to get answer. You may need to configure your own API key.");
		});
	});
});
