import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/db", () => ({ db: {} }));

import { buildThreadSendOptions } from "$lib/server/practice/send-options";

describe("buildThreadSendOptions", () => {
	const openingState = {
		post: { title: "What changed your mind?", body: "Tell me", subreddit: "AskReddit", author: "OP" },
		previousComments: [{ id: "c1", author: "Commenter", text: "A kind reply helped." }],
	};
	const base = { ui: "reddit" as const, openingState, messages: [], message: "Can you explain?", userName: "Learner" };

	it("places a reply under its target and has the target's author answer", () => {
		expect(buildThreadSendOptions({ ...base, targetCommentId: "c1", clientMessageId: "m1" })).toEqual({
			userDisplayContent: "Can you explain?",
			userMetadata: { thread: { commentId: "reddit-user-m1", targetCommentId: "c1", responderName: "Commenter", mode: "reply" } },
		});
	});

	it("rejects an unknown target", () => {
		expect(buildThreadSendOptions({ ...base, targetCommentId: "missing", clientMessageId: "m2" })).toBeNull();
	});

	it("keeps a failed comment's original placement when it is retried", () => {
		const thread = { commentId: "reddit-user-m3", targetCommentId: "c1", responderName: "Commenter", mode: "reply" };
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
