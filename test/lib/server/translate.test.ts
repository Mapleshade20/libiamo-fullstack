import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguageCode } from "$lib/constants";

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

describe("generateExpressions", () => {
	it("returns structured expressions from chatJson", async () => {
		mockChatJson.mockResolvedValueOnce({ value: ["Could I have the check, please?", "Is this seat taken?"] });

		const result = await generateExpressions({ title: "Ordering at a café" }, lang("en"), lang("fr"), "user-1");

		expect(result).toEqual(["Could I have the check, please?", "Is this seat taken?"]);
		const request = mockChatJson.mock.calls[0][0];
		expect(request).toMatchObject({ schema: expect.anything(), options: { temperature: 0.7, maxTokens: 1024 }, userId: "user-1" });
		expect(request.messages.map((message: { role: string }) => message.role)).toEqual(["system", "user"]);
	});
});

describe("evaluateUserTranslation", () => {
	it("returns structured feedback and correction from chatJson", async () => {
		mockChatJson.mockResolvedValueOnce({
			value: {
				feedback: "Good attempt! The word order needs adjustment.",
				correction: "Je voudrais un café au lait, s'il vous plaît.",
			},
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
			expect.objectContaining({
				schema: expect.any(Object),
				userId: "user-1",
			}),
		);
	});

	it("throws when chatJson rejects", async () => {
		mockChatJson.mockRejectedValueOnce(new Error("API down"));

		await expect(evaluateUserTranslation("Hello", "Hola", lang("en"), lang("es"))).rejects.toThrow("API down");
	});
});
