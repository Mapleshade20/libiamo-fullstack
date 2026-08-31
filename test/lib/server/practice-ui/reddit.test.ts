import { describe, expect, it } from "vitest";
import { buildRedditSendOptions } from "$lib/server/practice-ui/reddit";

describe("buildRedditSendOptions", () => {
	const openingState = {
		post: { title: "What changed your mind?", body: "Tell me", subreddit: "AskReddit", author: "OP" },
		previousComments: [{ id: "c1", author: "Commenter", text: "A kind reply helped." }],
	};

	it("builds targeted one-turn roleplay options", () => {
		const options = buildRedditSendOptions({
			openingState,
			messages: [],
			targetCommentId: "c1",
			message: "Can you explain?",
			clientMessageId: "client-1",
			userName: "Learner",
		});

		expect(options).toMatchObject({
			userDisplayContent: "Can you explain?",
			userMetadata: {
				thread: {
					commentId: "reddit-user-client-1",
					targetCommentId: "c1",
					responderName: "Commenter",
					mode: "reply",
				},
			},
		});
	});

	it("falls back to the post author for top-level comments", () => {
		const options = buildRedditSendOptions({
			openingState,
			messages: [],
			targetCommentId: null,
			message: "Great question!",
			clientMessageId: "client-2",
			userName: "Learner",
		});

		expect(options?.userMetadata).toMatchObject({ thread: { targetCommentId: null, mode: "post" } });
	});

	it("rejects missing reply targets", () => {
		const options = buildRedditSendOptions({
			openingState,
			messages: [],
			targetCommentId: "missing",
			message: "Hello",
			clientMessageId: "client-3",
			userName: "Learner",
		});

		expect(options).toBeNull();
	});
});
