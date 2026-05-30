import { describe, expect, it } from "vitest";
import type { ChatMessage } from "$lib/components/practice-ui/chatMessages";
import {
	buildTargetedCommentPrompt,
	type CommentThreadConfig,
	type CommentThreadTarget,
	countThreadComments,
	findOpeningCommentTarget,
	findTargetInMessages,
	flattenOpeningComments,
	getCommentIdForMessage,
	getParentCommentIdForMessage,
	getTargetsFromMessages,
	normalizeThreadText,
} from "$lib/components/practice-ui/commentThread";

// Minimal config for testing — mirrors real reddit/ao3 configs
const testConfig: CommentThreadConfig = {
	idPrefix: "test",
	openingIdPrefix: "opening",
	getAuthor: (c: Record<string, unknown>) => (c.author as string) ?? (c.username as string) ?? "",
	getText: (c: Record<string, unknown>) => (c.text as string) ?? (c.comment as string) ?? "",
	getReplies: (c: Record<string, unknown>) => (c.replies as Record<string, unknown>[]) ?? [],
	defaultAuthor: "Anonymous",
};

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: overrides.id ?? "msg-1",
		role: overrides.role ?? "user",
		text: overrides.text ?? "Hello",
		timestamp: overrides.timestamp ?? "now",
		authorName: overrides.authorName ?? "Author",
		thread: overrides.thread,
		clientMessageId: overrides.clientMessageId,
		isHidden: overrides.isHidden,
	};
}

describe("normalizeThreadText", () => {
	it("returns trimmed text for valid strings", () => {
		expect(normalizeThreadText("  hello  ")).toBe("hello");
		expect(normalizeThreadText("hello")).toBe("hello");
	});

	it("returns fallback for empty or falsy values", () => {
		expect(normalizeThreadText("")).toBe("");
		expect(normalizeThreadText(null)).toBe("");
		expect(normalizeThreadText(undefined)).toBe("");
		expect(normalizeThreadText(42)).toBe("");
	});

	it("uses custom fallback", () => {
		expect(normalizeThreadText("", "default")).toBe("default");
	});
});

describe("countThreadComments", () => {
	it("counts flat comments", () => {
		expect(countThreadComments([{ replies: [] }, { replies: [] }])).toBe(2);
	});

	it("counts nested replies recursively", () => {
		const tree = [
			{
				id: "a",
				author: "x",
				text: "t",
				depth: 0,
				parentId: null,
				source: "opening" as const,
				replies: [
					{
						id: "b",
						author: "y",
						text: "u",
						depth: 1,
						parentId: "a",
						source: "opening" as const,
						replies: [{ id: "c", author: "z", text: "v", depth: 2, parentId: "b", source: "opening" as const, replies: [] }],
					},
					{ id: "d", author: "w", text: "s", depth: 1, parentId: "a", source: "opening" as const, replies: [] },
				],
			},
		];
		expect(countThreadComments(tree)).toBe(4);
	});

	it("returns 0 for empty array", () => {
		expect(countThreadComments([])).toBe(0);
	});
});

describe("flattenOpeningComments", () => {
	it("flattens nested comments in depth-first order with correct depth and parentId", () => {
		const comments = [
			{
				id: "c1",
				author: "Alice",
				text: "Top",
				replies: [{ author: "Bob", text: "Reply", replies: [] }],
			},
			{ id: "c2", author: "Charlie", text: "Second top", replies: [] },
		];

		const result = flattenOpeningComments(comments, testConfig);

		expect(result).toHaveLength(3);
		expect(result[0]).toMatchObject({ id: "c1", author: "Alice", text: "Top", depth: 0, parentId: null });
		expect(result[1]).toMatchObject({ id: "opening-0-0", author: "Bob", text: "Reply", depth: 1, parentId: "c1" });
		expect(result[2]).toMatchObject({ id: "c2", author: "Charlie", text: "Second top", depth: 0, parentId: null });
	});

	it("returns empty array for empty input", () => {
		expect(flattenOpeningComments([], testConfig)).toEqual([]);
		expect(flattenOpeningComments(undefined as any, testConfig)).toEqual([]);
	});

	it("uses getTimestamp when provided", () => {
		const configWithTimestamp: CommentThreadConfig = { ...testConfig, getTimestamp: (c) => c.ts as string | undefined };
		const comments = [{ id: "c1", author: "Alice", text: "Hi", ts: "yesterday", replies: [] }];
		const result = flattenOpeningComments(comments, configWithTimestamp);
		expect(result[0].timestamp).toBe("yesterday");
	});
});

describe("findOpeningCommentTarget", () => {
	const comments = [{ id: "c1", author: "Alice", text: "Top", replies: [{ author: "Bob", text: "Nested", replies: [] }] }];

	it("finds target by id", () => {
		const target = findOpeningCommentTarget(comments, testConfig, "c1");
		expect(target?.author).toBe("Alice");
	});

	it("finds nested target by id", () => {
		const target = findOpeningCommentTarget(comments, testConfig, "opening-0-0");
		expect(target?.author).toBe("Bob");
	});

	it("returns null for null/undefined targetCommentId", () => {
		expect(findOpeningCommentTarget(comments, testConfig, null)).toBeNull();
		expect(findOpeningCommentTarget(comments, testConfig, undefined)).toBeNull();
	});

	it("returns null when target not found", () => {
		expect(findOpeningCommentTarget(comments, testConfig, "nonexistent")).toBeNull();
	});
});

describe("getCommentIdForMessage", () => {
	it("returns commentId from thread metadata when present", () => {
		const msg = makeMessage({ role: "user", thread: { commentId: "explicit-id" } });
		expect(getCommentIdForMessage(msg, testConfig)).toBe("explicit-id");
	});

	it("generates id from clientMessageId for user messages", () => {
		const msg = makeMessage({ role: "user", clientMessageId: "abc" });
		expect(getCommentIdForMessage(msg, testConfig)).toBe("test-user-abc");
	});

	it("generates id from clientMessageId for agent messages", () => {
		const msg = makeMessage({ role: "agent", clientMessageId: "def" });
		expect(getCommentIdForMessage(msg, testConfig)).toBe("test-agent-def");
	});

	it("falls back to role+id when no clientMessageId", () => {
		const msg = makeMessage({ role: "user" });
		expect(getCommentIdForMessage(msg, testConfig)).toBe("test-user-msg-1");
	});

	it("falls back when no thread metadata or clientMessageId", () => {
		const msg = makeMessage({ role: "agent", thread: undefined, clientMessageId: undefined });
		expect(getCommentIdForMessage(msg, testConfig)).toBe("test-agent-msg-1");
	});
});

describe("getParentCommentIdForMessage", () => {
	it("returns targetCommentId for user messages", () => {
		const msg = makeMessage({ role: "user", thread: { targetCommentId: "target-1" } });
		expect(getParentCommentIdForMessage(msg, testConfig)).toBe("target-1");
	});

	it("returns null when user message has no targetCommentId", () => {
		const msg = makeMessage({ role: "user" });
		expect(getParentCommentIdForMessage(msg, testConfig)).toBeNull();
	});

	it("returns parentCommentId for agent messages", () => {
		const msg = makeMessage({ role: "agent", thread: { parentCommentId: "parent-1" } });
		expect(getParentCommentIdForMessage(msg, testConfig)).toBe("parent-1");
	});

	it("falls back to user message id for agent reply", () => {
		const msg = makeMessage({ role: "agent", clientMessageId: "abc" });
		expect(getParentCommentIdForMessage(msg, testConfig)).toBe("test-user-abc");
	});
});

describe("getTargetsFromMessages", () => {
	it("maps visible messages to targets with correct ids", () => {
		const messages = [
			makeMessage({ id: "m1", role: "user", text: "Question", clientMessageId: "q1" }),
			makeMessage({ id: "m2", role: "agent", text: "Answer", clientMessageId: "q1", thread: { parentCommentId: "test-user-q1" } }),
		];

		const targets: CommentThreadTarget[] = getTargetsFromMessages(messages, testConfig);

		expect(targets).toHaveLength(2);
		expect(targets[0].id).toBe("test-user-q1");
		expect(targets[0].author).toBe("Author");
		expect(targets[1].id).toBe("test-agent-q1");
		expect(targets[1].parentId).toBe("test-user-q1");
	});

	it("filters hidden messages", () => {
		const messages = [
			makeMessage({ id: "m1", role: "user", text: "visible" }),
			makeMessage({ id: "m2", role: "agent", text: "hidden", isHidden: true }),
		];

		expect(getTargetsFromMessages(messages, testConfig)).toHaveLength(1);
	});
});

describe("findTargetInMessages", () => {
	const messages = [makeMessage({ id: "m1", role: "user", text: "Hello", clientMessageId: "q1" })];

	it("finds target by id", () => {
		const target = findTargetInMessages(messages, testConfig, "test-user-q1");
		expect(target?.text).toBe("Hello");
	});

	it("returns null for null/undefined targetCommentId", () => {
		expect(findTargetInMessages(messages, testConfig, null)).toBeNull();
	});

	it("returns null when not found", () => {
		expect(findTargetInMessages(messages, testConfig, "nonexistent")).toBeNull();
	});
});

describe("buildTargetedCommentPrompt", () => {
	const baseParams = {
		surfaceName: "Reddit",
		containerDescription: 'r/AskReddit post "Test"',
		containerAuthorName: "the post author",
		comment: "Great point!",
		responderName: "TheResponder",
		topLevelActionDescription: "new top-level Reddit comment",
		replyActionDescription: "replied to this Reddit comment",
	};

	it("builds top-level comment prompt", () => {
		const result = buildTargetedCommentPrompt({ ...baseParams, target: null });
		expect(result).toContain("new top-level");
		expect(result).toContain("roleplay as the post author");
		expect(result).toContain("Great point!");
		expect(result).not.toContain("Original comment");
	});

	it("builds reply prompt for targeted comment", () => {
		const target: CommentThreadTarget = { id: "c1", author: "Alice", text: "Original text", depth: 0, parentId: null };
		const result = buildTargetedCommentPrompt({ ...baseParams, target });
		expect(result).toContain("Comment author you must roleplay as: TheResponder");
		expect(result).toContain("Original comment: Original text");
		expect(result).not.toContain("new top-level");
	});
});
