import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguageCode } from "$lib/constants";
import { LANGUAGE_LABELS } from "$lib/constants";
import { buildEvaluationPrompt, buildExpressionsPrompt } from "$lib/server/translate";

// ── 1. Hoisted mocks ──────────────────────────────────────────────────
const { mockCreateSingleTurnChat } = vi.hoisted(() => {
	const mockCreateSingleTurnChat = vi.fn();
	return { mockCreateSingleTurnChat };
});

vi.mock("$lib/server/db", () => ({
	db: {},
}));

vi.mock("$lib/server/llm", async (importOriginal) => {
	const actual = await importOriginal<typeof import("$lib/server/llm")>();
	return {
		...actual,
		createSingleTurnChat: mockCreateSingleTurnChat,
	};
});

// Re-import after mocking so the mocked version is used
const { generateExpressions, evaluateUserTranslation } = await import("$lib/server/translate");

afterEach(() => {
	mockCreateSingleTurnChat.mockReset();
});

// ── Helpers ───────────────────────────────────────────────────────────
const lang = (code: string): LanguageCode => code as LanguageCode;

// ── 2. Prompt builders (pure functions) ───────────────────────────────

describe("buildExpressionsPrompt", () => {
	it("includes native and target language names in the prompt", () => {
		const prompt = buildExpressionsPrompt(lang("en"), lang("fr"));
		expect(prompt).toContain(LANGUAGE_LABELS.en);
		expect(prompt).toContain(LANGUAGE_LABELS.fr);
		expect(prompt).toContain("JSON array of strings");
	});

	it("includes guidance to return only JSON", () => {
		const prompt = buildExpressionsPrompt(lang("en"), lang("es"));
		expect(prompt).toContain("ONLY a JSON array of strings");
		expect(prompt).toContain("no markdown fences");
	});
});

describe("buildEvaluationPrompt", () => {
	it("includes native and target language names", () => {
		const prompt = buildEvaluationPrompt(lang("en"), lang("ja"));
		expect(prompt).toContain(LANGUAGE_LABELS.en);
		expect(prompt).toContain(LANGUAGE_LABELS.ja);
	});

	it("includes evaluation criteria", () => {
		const prompt = buildEvaluationPrompt(lang("es"), lang("fr"));
		expect(prompt).toContain("Accuracy");
		expect(prompt).toContain("Grammar");
		expect(prompt).toContain("Naturalness");
		expect(prompt).toContain("Register");
	});

	it("instructs concise encouraging feedback", () => {
		const prompt = buildEvaluationPrompt(lang("en"), lang("es"));
		expect(prompt).toContain("encouraging");
		expect(prompt).toContain("constructive");
		expect(prompt).toContain("1-2 sentences");
	});

	it("expects JSON object with feedback and correction", () => {
		const prompt = buildEvaluationPrompt(lang("en"), lang("fr"));
		expect(prompt).toContain('"feedback"');
		expect(prompt).toContain('"correction"');
	});
});

// ── 3. generateExpressions (with mocked LLM) ──────────────────────────

describe("generateExpressions", () => {
	it("parses a clean JSON array response", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: { content: '["Could I have the check, please?", "Is this seat taken?"]' },
		});

		const result = await generateExpressions({ title: "Ordering at a café" }, lang("en"), lang("fr"));

		expect(result).toEqual(["Could I have the check, please?", "Is this seat taken?"]);
	});

	it("parses a JSON array inside a code fence", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: {
				content: '```json\n["How much does it cost?", "Can I pay by card?"]\n```',
			},
		});

		const result = await generateExpressions({ title: "Shopping" }, lang("en"), lang("es"));

		expect(result).toEqual(["How much does it cost?", "Can I pay by card?"]);
	});

	it("handles empty array response", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: { content: "[]" },
		});

		const result = await generateExpressions({ title: "Empty task" }, lang("en"), lang("ja"));

		expect(result).toEqual([]);
	});

	it("returns empty array when JSON parses to a non-array object", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: { content: '{"expressions": ["one", "two"]}' },
		});

		const result = await generateExpressions({ title: "Wrapped in object" }, lang("en"), lang("fr"));

		expect(result).toEqual([]);
	});

	it("falls back to line extraction for non-JSON response", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: {
				content: "1. Hello, how are you?\n2. Where is the bathroom?\n3. Thank you very much!",
			},
		});

		const result = await generateExpressions({ title: "Travel" }, lang("en"), lang("fr"));

		expect(result.length).toBe(3);
		expect(result[0]).toContain("Hello");
		expect(result[1]).toContain("Where");
		expect(result[2]).toContain("Thank you");
	});

	it("filters out non-string entries from parsed arrays", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			// JSON.parse would throw on this, but the mock returns a valid array with a number
			reply: { content: '["Valid phrase", 123, "Another valid phrase"]' },
		});

		const result = await generateExpressions({ title: "Test" }, lang("en"), lang("es"));

		expect(result).toEqual(["Valid phrase", "Another valid phrase"]);
	});

	it("passes task context details to the LLM", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: { content: '["One expression"]' },
		});

		await generateExpressions(
			{
				title: "Writing an email",
				description: "Practice composing a formal email",
				objectives: ["Use proper salutations", "Close politely"],
				uiLabel: "Apple Mail",
				interactionType: "compose",
			},
			lang("en"),
			lang("fr"),
		);

		const userMessage = mockCreateSingleTurnChat.mock.calls[0][0].userMessage as string;
		expect(userMessage).toContain("Writing an email");
		expect(userMessage).toContain("formal email");
		expect(userMessage).toContain("Use proper salutations");
		expect(userMessage).toContain("Close politely");
		expect(userMessage).toContain("Apple Mail");
		expect(userMessage).toContain("compose");
	});
});

// ── 4. evaluateUserTranslation (with mocked LLM) ──────────────────────

describe("evaluateUserTranslation", () => {
	it("parses a clean JSON response with feedback and correction", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: {
				content: '{"feedback": "Good attempt! The word order needs adjustment.", "correction": "Je voudrais un café au lait, s\'il vous plaît."}',
			},
		});

		const result = await evaluateUserTranslation(
			"I would like a coffee with milk, please.",
			"Je voudrais un café avec du lait, s'il vous plaît.",
			lang("en"),
			lang("fr"),
		);

		expect(result.feedback).toContain("Good attempt");
		expect(result.correction).toContain("café au lait");
	});

	it("parses JSON inside a code fence", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: {
				content: '```json\n{"feedback": "Perfect!", "correction": "¿Cuánto cuesta?"}\n```',
			},
		});

		const result = await evaluateUserTranslation("How much does it cost?", "¿Cuánto cuesta?", lang("en"), lang("es"));

		expect(result.feedback).toBe("Perfect!");
		expect(result.correction).toBe("¿Cuánto cuesta?");
	});

	it("falls back to raw text as feedback for non-JSON responses", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: {
				content: "This is a great translation! No corrections needed.",
			},
		});

		const result = await evaluateUserTranslation("Good morning", "Bonjour", lang("en"), lang("fr"));

		expect(result.feedback).toContain("great translation");
		expect(result.correction).toBe("");
	});

	it("passes source and user translation to the LLM", async () => {
		mockCreateSingleTurnChat.mockResolvedValueOnce({
			reply: { content: '{"feedback": "Nice!", "correction": "¿Dónde está el baño?"}' },
		});

		await evaluateUserTranslation("Where is the bathroom?", "¿Dónde está el baño?", lang("en"), lang("es"));

		const userMessage = mockCreateSingleTurnChat.mock.calls[0][0].userMessage as string;
		expect(userMessage).toContain("Where is the bathroom?");
		expect(userMessage).toContain("¿Dónde está el baño?");
	});

	it("returns empty feedback when LLM throws", async () => {
		mockCreateSingleTurnChat.mockRejectedValueOnce(new Error("API down"));

		await expect(evaluateUserTranslation("Hello", "Hola", lang("en"), lang("es"))).rejects.toThrow("API down");
	});
});

// ── 5. generateExpressions error handling ─────────────────────────────

describe("generateExpressions error handling", () => {
	it("throws when createSingleTurnChat rejects", async () => {
		mockCreateSingleTurnChat.mockRejectedValueOnce(new Error("Network error"));

		await expect(generateExpressions({ title: "Test" }, lang("en"), lang("fr"))).rejects.toThrow("Network error");
	});
});
