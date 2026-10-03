import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/db", () => ({ db: {} }));

import { buildChatReplySendOptions, buildThreadSendOptions } from "$lib/server/practice/send-options";

describe("buildThreadSendOptions", () => {
	const openingState = {
		post: { title: "What changed your mind?", body: "Tell me", subreddit: "AskReddit", author: "OP" },
		previousComments: [{ id: "c1", author: "Commenter", text: "A kind reply helped." }],
	};
	const base = { ui: "reddit" as const, openingState, messages: [], message: "Can you explain?", userName: "Learner" };

	it("places a reply under its target", () => {
		expect(buildThreadSendOptions({ ...base, targetCommentId: "c1", clientMessageId: "m1" })).toEqual({
			userDisplayContent: "Can you explain?",
			userMetadata: { thread: { commentId: "reddit-user-m1", targetCommentId: "c1" } },
		});
	});

	it("rejects an unknown target", () => {
		expect(buildThreadSendOptions({ ...base, targetCommentId: "missing", clientMessageId: "m2" })).toBeNull();
	});

	it("keeps a failed comment's original placement when it is retried", () => {
		const thread = { commentId: "reddit-user-m3", targetCommentId: "c1" };
		const messages = [
			{
				id: 1,
				role: "user",
				content: "Original",
				createdAt: new Date(),
				llmMetadata: { clientMessageId: "m3", failed: true, displayContent: "Original", thread },
			},
		];

		expect(buildThreadSendOptions({ ...base, messages, targetCommentId: null, clientMessageId: "m3" })).toEqual({
			userDisplayContent: "Original",
			userMetadata: { thread },
		});
	});
});

describe("buildChatReplySendOptions", () => {
	const openingState = { previousMessages: [{ sender: "Rin", text: "anyone up?" }] };
	const messages = [
		{ id: 7, role: "assistant", content: "yo", createdAt: new Date("2026-01-01T10:00:00Z"), llmMetadata: { assistantAuthorName: "Kai" } },
		{ id: 8, role: "user", content: "hey", createdAt: new Date("2026-01-01T10:01:00Z"), llmMetadata: { clientMessageId: "c8" } },
	];
	const base = { ui: "discord" as const, openingState, messages, userName: "Maple" };

	it("quotes opening lines and delivered messages by their scene ref", () => {
		for (const replyTo of ["opening-0", "discord-agent-7"]) {
			expect(buildChatReplySendOptions({ ...base, replyTo })).toEqual({ userMetadata: { replyTo } });
		}
	});

	it("rejects unknown targets and reply placeholders", () => {
		expect(buildChatReplySendOptions({ ...base, replyTo: "opening-5" })).toBeNull();
		// The learner's unanswered message is followed by a pending placeholder, which is never quotable.
		expect(buildChatReplySendOptions({ ...base, replyTo: "discord-agent-c8" })).toBeNull();
	});
});
