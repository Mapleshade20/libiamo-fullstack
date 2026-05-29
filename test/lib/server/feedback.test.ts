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

import { buildFeedbackConversation, followUpOnFeedback } from "$lib/server/feedback";
import { chatJson } from "$lib/server/llm";

const mockChatJson = chatJson as ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.query.practiceSession.findFirst.mockResolvedValue({ task: { language: "es" } });
	mockChatJson.mockResolvedValue({ answer: "Helpful explanation" });
});

type SessionMessageRow = {
	id: number;
	role: string;
	content: string;
	createdAt: string | Date;
	llmMetadata: unknown;
};

function makeMsg(overrides: Partial<SessionMessageRow> = {}): SessionMessageRow {
	return {
		id: overrides.id ?? 1,
		role: overrides.role ?? "user",
		content: overrides.content ?? "Hello",
		createdAt: overrides.createdAt ?? new Date(),
		llmMetadata: overrides.llmMetadata ?? null,
	};
}

describe("buildFeedbackConversation", () => {
	it("builds linear conversation for discord", () => {
		const result = buildFeedbackConversation(
			[makeMsg({ id: 1, role: "user", content: "Hola" }), makeMsg({ id: 2, role: "agent", content: "¡Hola!" })],
			{},
			"discord",
		);
		expect(result.chains).toHaveLength(1);
		expect(result.chains[0].label).toBe("Conversation");
		expect(result.allMessages).toHaveLength(2);
		expect(result.allMessages[0].role).toBe("user");
		expect(result.allMessages[1].role).toBe("agent");
	});

	it("skips hidden messages", () => {
		const result = buildFeedbackConversation(
			[makeMsg({ id: 1, role: "user", content: "visible" }), makeMsg({ id: 2, role: "agent", content: "hidden", llmMetadata: { hidden: true } })],
			{},
			"discord",
		);
		expect(result.allMessages).toHaveLength(1);
		expect(result.allMessages[0].text).toBe("visible");
	});

	it("uses displayContent from llmMetadata when available", () => {
		const result = buildFeedbackConversation(
			[makeMsg({ id: 1, role: "user", content: "raw", llmMetadata: { displayContent: "display" } })],
			{},
			"discord",
		);
		expect(result.allMessages[0].text).toBe("display");
	});

	it("includes discord openingState previousMessages as context", () => {
		const result = buildFeedbackConversation(
			[makeMsg({ id: 1, role: "user", content: "reply" })],
			{ previousMessages: [{ sender: "Bot", text: "Welcome" }] },
			"discord",
		);
		expect(result.allMessages[0].role).toBe("context");
		expect(result.allMessages[0].author).toBe("Bot");
		expect(result.allMessages[1].role).toBe("user");
	});

	it("includes imessage openingState as context", () => {
		const result = buildFeedbackConversation(
			[makeMsg({ id: 1, role: "user", content: "reply" })],
			{ previousMessages: [{ sender: "Alice", text: "Hey" }] },
			"imessage",
		);
		expect(result.allMessages[0].role).toBe("context");
	});

	it("includes mail openingState emails as context", () => {
		const result = buildFeedbackConversation(
			[makeMsg({ id: 1, role: "user", content: "reply" })],
			{ emails: [{ from: "boss@co.com", subject: "Meeting", body: "Join at 3pm" }] },
			"apple_mail",
		);
		expect(result.allMessages[0].role).toBe("context");
		expect(result.allMessages[0].text).toContain("[Meeting]");
	});

	it("builds tree chains for reddit with opening post and comments", () => {
		const result = buildFeedbackConversation(
			[makeMsg({ id: 1, role: "user", content: "My reply", llmMetadata: { thread: { commentId: "c1", targetCommentId: "opening-0" } } })],
			{
				post: { title: "AITA", body: "story...", author: "OP" },
				previousComments: [{ id: "opening-0", author: "Commenter", text: "You're wrong" }],
			},
			"reddit",
		);
		expect(result.chains.length).toBeGreaterThanOrEqual(1);
		expect(result.allMessages.some((m) => m.author === "OP")).toBe(true);
		expect(result.allMessages.some((m) => m.text === "You're wrong")).toBe(true);
	});

	it("builds tree chains for ao3 with work and comments", () => {
		const result = buildFeedbackConversation(
			[makeMsg({ id: 1, role: "user", content: "Great fic!", llmMetadata: { thread: { commentId: "c1" } } })],
			{ workTitle: "My Story", authorName: "Writer", previousComments: [] },
			"ao3",
		);
		expect(result.allMessages.some((m) => m.text?.includes("My Story"))).toBe(true);
	});

	it("handles nested reddit comments", () => {
		const result = buildFeedbackConversation(
			[
				makeMsg({
					id: 1,
					role: "user",
					content: "reply to nested",
					llmMetadata: { thread: { commentId: "c2", targetCommentId: "opening-0-0" } },
				}),
			],
			{
				post: { title: "Post" },
				previousComments: [
					{
						id: "opening-0",
						author: "A",
						text: "Top comment",
						replies: [{ id: "opening-0-0", author: "B", text: "Nested reply" }],
					},
				],
			},
			"reddit",
		);
		expect(result.allMessages.some((m) => m.text === "Top comment")).toBe(true);
		expect(result.allMessages.some((m) => m.text === "Nested reply")).toBe(true);
	});

	it("builds linear conversation for unknown UI type fallback", () => {
		const result = buildFeedbackConversation([makeMsg({ id: 1, role: "user", content: "test" })], {}, "unknown_ui" as any);
		expect(result.chains).toHaveLength(1);
		expect(result.allMessages).toHaveLength(1);
	});
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
