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

import { buildFeedbackConversation, generateFeedback } from "$lib/server/feedback";
import { chatText } from "$lib/server/llm";

const mockChatText = chatText as ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.query.practiceSession.findFirst.mockResolvedValue({ task: { language: "es" } });
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

describe("generateFeedback", () => {
	const existingFeedback = {
		feedbackLanguage: "zh",
		annotations: [{ messageId: 1, annotatedText: "你好", spans: [], comment: "很好" }],
		objectives: [{ text: "流利表达", grade: "A" as const }],
		summary: "完成得很好。",
	};

	it("returns persisted feedback without regenerating or changing its language", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue({
			id: 42,
			userId: "user-1",
			status: "evaluated",
			tutorFeedback: existingFeedback,
			agentPromptSnapshot: {},
			task: { language: "es", objectives: [], template: { ui: "discord" }, variant: { openingState: {} } },
			messages: [],
		});

		await expect(generateFeedback({ sessionId: 42, feedbackLanguage: "es" })).resolves.toEqual(existingFeedback);
		expect(mockChatText).not.toHaveBeenCalled();
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it("persists only while feedback is still absent", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue({
			id: 42,
			userId: "user-1",
			status: "completed",
			tutorFeedback: null,
			agentPromptSnapshot: {},
			task: { language: "es", objectives: [], template: { ui: "discord" }, variant: { openingState: {} } },
			messages: [{ id: 1, role: "user", content: "Hola", createdAt: new Date("2026-01-01T00:00:00Z"), llmMetadata: null }],
		});
		mockChatText.mockResolvedValue({
			content:
				'<feedback><message id="1"><annotated>Hola</annotated><comment>Bien.</comment></message><objectives><objective grade="A">Fluidez</objective></objectives><summary>Bien.</summary></feedback>',
		});
		const returning = vi.fn().mockResolvedValue([{ id: 42 }]);
		const where = vi.fn(() => ({ returning }));
		const set = vi.fn(() => ({ where }));
		mockDb.update.mockReturnValue({ set });

		const result = await generateFeedback({ sessionId: 42, feedbackLanguage: "es" });

		expect(result.feedbackLanguage).toBe("es");
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({ status: "evaluated", tutorFeedback: expect.objectContaining({ feedbackLanguage: "es" }) }),
		);
		expect(where).toHaveBeenCalledOnce();
	});
});
