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

vi.mock("$lib/server/client", () => ({
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

		it("returns 404 when template not found", async () => {
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([]);
			const result = (await actions.submit(createActionEvent({ translations: '{"0-0":"hello"}' }, { id: "999" }))) as any;
			expect(result.status).toBe(404);
		});

		it("evaluates and marks as evaluated on success", async () => {
			const translations = { "0-0": "Bonjour", "0-1": "Au revoir" };
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
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello", "Goodbye"]], language: "fr" }]);

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
			const translations = { "0-0": "Bonjour" };

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello"]], language: "fr" }]);

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
			const translations = { "0-0": "Ciao" };
			const evaluation = { overallScore: "B", overallFeedback: "Decent" };

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello"]], language: "it" }]);
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
			const translations = { "0-0": "Bonjour" };

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello"]], language: "fr" }]);

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
			const translations = { "0-0": "Hola" };

			// Template query for submit: where → limit
			mockWhere.mockReturnValueOnce({ limit: mockLimit });
			mockLimit.mockResolvedValueOnce([{ translationBase: [["Hello"]], language: "es" }]);

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
	});
});
