import { afterEach, describe, expect, it, vi } from "vitest";
import { getLanguageEnglishName, type LanguageCode } from "$lib/constants";
import { buildEvaluationPrompt, buildExpressionsPrompt } from "$lib/server/translate";

const { mockChatJson } = vi.hoisted(() => ({
	mockChatJson: vi.fn(),
}));

vi.mock("$lib/server/db", () => ({ db: {} }));

vi.mock("$lib/server/llm", async (importOriginal) => {
	const actual = await importOriginal<typeof import("$lib/server/llm")>();
	return {
		...actual,
		chatJson: mockChatJson,
	};
});

const { generateExpressions, evaluateUserTranslation } = await import("$lib/server/translate");

afterEach(() => {
	mockChatJson.mockReset();
});

const lang = (code: string): LanguageCode => code as LanguageCode;

describe("buildExpressionsPrompt", () => {
	it("includes native and target language names in the prompt", () => {
		const prompt = buildExpressionsPrompt(lang("en"), lang("fr"));
		expect(prompt).toContain(getLanguageEnglishName("en"));
		expect(prompt).toContain(getLanguageEnglishName("fr"));
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
		expect(prompt).toContain(getLanguageEnglishName("en"));
		expect(prompt).toContain(getLanguageEnglishName("ja"));
	});

	it("includes evaluation criteria and JSON shape", () => {
		const prompt = buildEvaluationPrompt(lang("es"), lang("fr"));
		expect(prompt).toContain("Accuracy");
		expect(prompt).toContain("Grammar");
		expect(prompt).toContain("Naturalness");
		expect(prompt).toContain("Register");
		expect(prompt).toContain('"feedback"');
		expect(prompt).toContain('"correction"');
	});
});

describe("generateExpressions", () => {
	it("returns structured expressions from chatJson", async () => {
		mockChatJson.mockResolvedValueOnce(["Could I have the check, please?", "Is this seat taken?"]);

		const result = await generateExpressions({ title: "Ordering at a café" }, lang("en"), lang("fr"), "user-1");

		expect(result).toEqual(["Could I have the check, please?", "Is this seat taken?"]);
		expect(mockChatJson).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				messages: [
					expect.objectContaining({ role: "system", content: expect.stringContaining("expert French language teacher") }),
					expect.objectContaining({ role: "user", content: expect.stringContaining("Ordering at a café") }),
				],
				options: { temperature: 0.7, maxTokens: 1024 },
				userId: "user-1",
			}),
		);
	});

	it("passes task context details to the LLM", async () => {
		mockChatJson.mockResolvedValueOnce(["One expression"]);

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

		const userMessage = mockChatJson.mock.calls[0][1].messages[1].content as string;
		expect(userMessage).toContain("Writing an email");
		expect(userMessage).toContain("formal email");
		expect(userMessage).toContain("Use proper salutations");
		expect(userMessage).toContain("Close politely");
		expect(userMessage).toContain("Apple Mail");
		expect(userMessage).toContain("compose");
	});
});

describe("evaluateUserTranslation", () => {
	it("returns structured feedback and correction from chatJson", async () => {
		mockChatJson.mockResolvedValueOnce({
			feedback: "Good attempt! The word order needs adjustment.",
			correction: "Je voudrais un café au lait, s'il vous plaît.",
		});

		const result = await evaluateUserTranslation(
			"I would like a coffee with milk, please.",
			"Je voudrais un café avec du lait, s'il vous plaît.",
			lang("en"),
			lang("fr"),
			"user-1",
		);

		expect(result.feedback).toContain("Good attempt");
		expect(result.correction).toContain("café au lait");
		expect(mockChatJson).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining("Je voudrais") })]),
				userId: "user-1",
			}),
		);
	});

	it("throws when chatJson rejects", async () => {
		mockChatJson.mockRejectedValueOnce(new Error("API down"));

		await expect(evaluateUserTranslation("Hello", "Hola", lang("en"), lang("es"))).rejects.toThrow("API down");
	});
});
