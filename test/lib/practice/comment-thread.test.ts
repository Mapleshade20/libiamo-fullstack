import { describe, expect, it } from "vitest";
import {
	buildCommentThread,
	countComments,
	findThreadTarget,
	flattenOpeningComments,
	getThreadOwner,
	newCommentMetadata,
	type ThreadComment,
} from "$lib/practice/comment-thread";
import { buildChatMessages, type ChatMessage } from "$lib/practice/messages";

const ao3 = {
	authorName: "HikariKitsune02",
	previousComments: [
		{
			id: "c1",
			username: "WispPattio",
			comment: "I’d love to know the differences.",
			replies: [
				{ id: "c1-r1", username: "HikariKitsune02", comment: "They do not have Semblances." },
				{ username: "Ranjira", comment: "Silver Eyes could work." },
			],
		},
	],
};

const reddit = { post: { author: "OP", title: "Question" }, previousComments: [{ author: "", text: "First!" }] };

function ids(comments: ThreadComment[]): string[] {
	return comments.flatMap((comment) => [comment.id, ...ids(comment.replies)]);
}

describe("opening comments", () => {
	it("keeps authored ids, derives path ids for the rest, and uses each platform's field names", () => {
		expect(flattenOpeningComments("ao3", ao3).map((comment) => [comment.id, comment.author, comment.parentId])).toEqual([
			["c1", "WispPattio", null],
			["c1-r1", "HikariKitsune02", "c1"],
			["opening-0-1", "Ranjira", "c1"],
		]);
		expect(flattenOpeningComments("reddit", reddit)[0]).toMatchObject({ id: "opening-0", author: "deleted", text: "First!" });
	});

	it("names the owner who answers top-level comments, with platform fallbacks", () => {
		expect(getThreadOwner("ao3", ao3)).toBe("HikariKitsune02");
		expect(getThreadOwner("reddit", reddit)).toBe("OP");
		expect(getThreadOwner("reddit", {})).toBe("OP");
		expect(getThreadOwner("ao3", {})).toBe("FicAuthor");
	});
});

describe("buildCommentThread", () => {
	it("nests an async-delivered reply under the learner comment with the responder's name", () => {
		// Row shapes as the worker writes them: the reply carries the parent copied from the comment.
		const messages = buildChatMessages({
			rawMessages: [
				{
					id: 101,
					role: "user",
					content: "Loved this!",
					createdAt: "2026-08-21 12:40:00",
					llmMetadata: { clientMessageId: "m1", thread: { commentId: "ao3-user-m1", targetCommentId: "c1-r1", responderName: "HikariKitsune02" } },
				},
				{
					id: 102,
					role: "assistant",
					content: "Thank you!",
					createdAt: "2026-08-21 15:53:00",
					llmMetadata: { assistantAuthorName: "HikariKitsune02", thread: { parentCommentId: "ao3-user-m1", responderName: "HikariKitsune02" } },
				},
			],
			formatTimestamp: () => "Later",
			userName: "Learner",
			agentName: "Fallback",
		});

		const tree = buildCommentThread("ao3", ao3, messages);
		const learner = tree[0].replies[0].replies[0];
		expect(learner).toMatchObject({ id: "ao3-user-m1", author: "Learner", depth: 2 });
		expect(learner.replies[0]).toMatchObject({ text: "Thank you!", author: "HikariKitsune02", depth: 3 });
		expect(countComments(tree)).toBe(5);
	});

	it("leaves pending placeholders out and puts comments without a known parent at the top level", () => {
		const messages: ChatMessage[] = [
			{ id: "u1", role: "user", text: "Top level", timestamp: "", authorName: "Learner", clientMessageId: "m1" },
			{ id: "p1", role: "agent", text: "", timestamp: "", authorName: "OP", clientMessageId: "m1", deliveryState: "pending" },
		];

		expect(ids(buildCommentThread("reddit", reddit, messages))).toEqual(["opening-0", "reddit-user-m1"]);
	});
});

describe("reply targets and new comments", () => {
	const sessionComment: ChatMessage = {
		id: "7",
		role: "agent",
		text: "Earlier reply",
		timestamp: "",
		authorName: "WispPattio",
		thread: { commentId: "ao3-agent-x" },
	};

	it("finds a target among opening comments and session comments", () => {
		expect(findThreadTarget("ao3", ao3, [], "c1-r1")?.author).toBe("HikariKitsune02");
		expect(findThreadTarget("ao3", ao3, [sessionComment], "ao3-agent-x")?.text).toBe("Earlier reply");
		expect(findThreadTarget("ao3", ao3, [], "missing")).toBeNull();
		expect(findThreadTarget("ao3", ao3, [], null)).toBeNull();
	});

	it("routes a reply to the target's author and a top-level comment to the owner", () => {
		const target = findThreadTarget("reddit", { previousComments: [{ id: "c9", author: "Commenter", text: "Hi" }] }, [], "c9");

		expect(newCommentMetadata("reddit", "m1", target, reddit)).toEqual({
			user: { commentId: "reddit-user-m1", targetCommentId: "c9", responderName: "Commenter", mode: "reply" },
			agent: { commentId: "reddit-agent-m1", parentCommentId: "reddit-user-m1", responderName: "Commenter", mode: "reply" },
		});
		expect(newCommentMetadata("ao3", "m2", null, ao3).user).toMatchObject({ targetCommentId: null, responderName: "HikariKitsune02", mode: "work" });
	});
});
