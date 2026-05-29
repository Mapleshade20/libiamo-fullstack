import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		query: {
			practiceSession: { findFirst: vi.fn() },
		},
		update: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/llm", () => ({
	chatJson: vi.fn(),
	chatText: vi.fn(),
}));

import { followUpOnFeedback } from "$lib/server/feedback";
import { chatJson } from "$lib/server/llm";

const mockChatJson = chatJson as ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.query.practiceSession.findFirst.mockResolvedValue({ task: { language: "es" } });
	mockChatJson.mockResolvedValue({ answer: "Helpful explanation" });
});

describe("followUpOnFeedback", () => {
	it("includes original context for issue explanations", async () => {
		await followUpOnFeedback({
			sessionId: 42,
			userId: "user-1",
			itemText: "yo fue",
			category: "grammar",
			question: "Explain this issue in detail with examples.",
			explanationMode: "issue",
			previousContext: "[Agent] ¿Qué hiciste ayer?",
			currentContext: "[You] yo fue al mercado",
		});

		const systemPrompt = mockChatJson.mock.calls[0]?.[1]?.messages?.[0]?.content as string;
		expect(systemPrompt).toContain("Type: Feedback issue");
		expect(systemPrompt).toContain("Previous visible message/context:\n[Agent] ¿Qué hiciste ayer?");
		expect(systemPrompt).toContain("Original current message/comment context:\n[You] yo fue al mercado");
		expect(systemPrompt).toContain("Treat the selected text as an issue");
	});

	it("uses good-expression wording for Tutor Comment highlights", async () => {
		await followUpOnFeedback({
			sessionId: 42,
			userId: "user-1",
			itemText: "me parece que",
			category: "vocabulary",
			question: "Explain why this is a useful expression and give examples of how to use it.",
			explanationMode: "good_expression",
			previousContext: "[Agent] ¿Qué opinas?",
			currentContext: "Learner message: Me parece que es buena idea.\nTutor comment: me parece que is a useful opinion phrase.",
		});

		const systemPrompt = mockChatJson.mock.calls[0]?.[1]?.messages?.[0]?.content as string;
		expect(systemPrompt).toContain("Type: Good expression");
		expect(systemPrompt).toContain("Treat the selected text as a good/natural expression worth learning, not as a mistake.");
		expect(systemPrompt).toContain("Tutor comment: me parece que is a useful opinion phrase.");
		expect(systemPrompt).not.toContain("Treat the selected text as an issue");
	});
});
