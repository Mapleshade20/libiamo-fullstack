import { describe, expect, it } from "vitest";
import type { ChatMessage } from "$lib/components/practice-ui/chatMessages";
import {
	buildRedditCommentTree,
	countRedditComments,
	flattenRedditComments,
	getRedditCommentVotes,
} from "$lib/components/practice-ui/reddit/helpers";

describe("Reddit comment-thread helpers", () => {
	const openingState = {
		post: { title: "What changed your mind?", body: "Tell me a story", subreddit: "AskReddit", author: "OriginalPoster" },
		previousComments: [
			{
				id: "c1",
				author: "ThoughtfulUser",
				text: "A teacher took me seriously.",
				replies: [{ author: "OriginalPoster", text: "That sounds meaningful." }],
			},
		],
	};

	it("flattens nested opening comments with stable ids", () => {
		const result = flattenRedditComments(openingState.previousComments);

		expect(result.map((comment) => comment.id)).toEqual(["c1", "opening-0-0"]);
		expect(result[1]).toMatchObject({ username: "OriginalPoster", depth: 1, parentId: "c1" });
	});

	it("attaches session comments under their Reddit targets using generic thread metadata", () => {
		const messages: ChatMessage[] = [
			{
				id: "u1",
				role: "user",
				text: "Can you say more?",
				timestamp: "now",
				authorName: "Learner",
				clientMessageId: "msg-1",
				thread: { commentId: "reddit-user-msg-1", targetCommentId: "c1", responderName: "ThoughtfulUser", mode: "reply" },
			},
			{
				id: "a1",
				role: "agent",
				text: "It made me feel seen.",
				timestamp: "now",
				authorName: "ThoughtfulUser",
				clientMessageId: "msg-1",
				thread: { commentId: "reddit-agent-msg-1", parentCommentId: "reddit-user-msg-1", responderName: "ThoughtfulUser" },
			},
		];

		const tree = buildRedditCommentTree({ openingState, messages });
		const root = tree[0];
		expect(root.replies.map((reply) => reply.id)).toContain("reddit-user-msg-1");
		const userComment = root.replies.find((reply) => reply.id === "reddit-user-msg-1");
		expect(userComment?.replies[0]).toMatchObject({ id: "reddit-agent-msg-1", username: "ThoughtfulUser" });
	});

	it("countRedditComments delegates to countThreadComments", () => {
		const tree = buildRedditCommentTree({ openingState, messages: [] });
		expect(countRedditComments(tree)).toBeGreaterThan(0);
	});

	it("getRedditCommentVotes uses votes when present", () => {
		const tree = buildRedditCommentTree({ openingState, messages: [] });
		expect(getRedditCommentVotes({ ...tree[0], votes: 42 }, "fallback")).toBe(42);
	});
});
