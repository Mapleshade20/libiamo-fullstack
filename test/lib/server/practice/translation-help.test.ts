import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguageCode } from "$lib/constants";

const { mockChatJson } = vi.hoisted(() => ({
	mockChatJson: vi.fn(),
}));

vi.mock("$lib/server/db", () => ({ db: {} }));

vi.mock("$lib/server/llm", () => ({ chatJson: mockChatJson }));

const { generateExpressions, evaluateUserTranslation } = await import("$lib/server/practice/translation-help");

afterEach(() => {
	mockChatJson.mockReset();
});

const lang = (code: string): LanguageCode => code as LanguageCode;

describe("generateExpressions", () => {
	it("returns structured expressions from chatJson", async () => {
		mockChatJson.mockResolvedValueOnce({ value: ["Could I have the check, please?", "Is this seat taken?"] });

		const task = { title: "Ordering at a café", language: "fr", ui: "imessage" as const, objectives: ["Ask for the bill"] };
		const result = await generateExpressions(task, lang("en"), lang("fr"), "user-1", 1);

		expect(result).toEqual(["Could I have the check, please?", "Is this seat taken?"]);
		const request = mockChatJson.mock.calls[0][0];
		expect(request).toMatchObject({ schema: expect.anything(), options: { temperature: 0.7, maxTokens: 1024 }, userId: "user-1" });
		expect(request.messages.map((message: { role: string }) => message.role)).toEqual(["system", "user"]);
		// The task is this call's input; the system message stays the stable role and contract.
		expect(request.messages[0].content).not.toContain("Ordering at a café");
		expect(request.messages[1].content).toContain("Ordering at a café");
		expect(request.messages[1].content).toContain("Ask for the bill");
		expect(request.messages[1].content).toContain("beginner (1 of 3)");
	});

	it("includes the opening messages the learner will answer", async () => {
		mockChatJson.mockResolvedValueOnce({ value: ["Je suis libre samedi."] });
		const task = {
			title: "Weekend plans",
			language: "fr",
			ui: "imessage" as const,
			openingState: { previousMessages: [{ sender: "Léa", text: "Tu es libre samedi ?" }] },
		};

		await generateExpressions(task, lang("en"), lang("fr"));

		const [system, user] = mockChatJson.mock.calls[0][0].messages;
		expect(user.content).toContain("Léa: Tu es libre samedi ?");
		expect(system.content).not.toContain("Tu es libre samedi");
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
		const request = mockChatJson.mock.calls[0][0];
		expect(request).toMatchObject({ schema: expect.any(Object), userId: "user-1" });
		expect(request.messages[0].content).not.toContain("café avec du lait");
		expect(JSON.parse(request.messages[1].content)).toEqual({
			source: "I would like a coffee with milk, please.",
			translation: "Je voudrais un café avec du lait, s'il vous plaît.",
		});
	});

	it("throws when chatJson rejects", async () => {
		mockChatJson.mockRejectedValueOnce(new Error("API down"));

		await expect(evaluateUserTranslation("Hello", "Hola", lang("en"), lang("es"))).rejects.toThrow("API down");
	});
});
