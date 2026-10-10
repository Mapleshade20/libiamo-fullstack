import { describe, expect, it } from "vitest";
import {
	ancestorRefs,
	buildCommentThread,
	countComments,
	findThreadTarget,
	flattenOpeningComments,
	getThreadOwner,
	joinedConversation,
	newCommentMetadata,
	type PendingConversation,
	type ThreadComment,
	targetRefOf,
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

function learnerMessage(clientMessageId: string, targetCommentId: string | null): ChatMessage {
	return {
		id: clientMessageId,
		role: "user",
		text: "…",
		timestamp: "",
		authorName: "Learner",
		clientMessageId,
		thread: { commentId: `reddit-user-${clientMessageId}`, targetCommentId },
	};
}

function castReply(id: string, parentCommentId: string): ChatMessage {
	return { id, role: "agent", text: "…", timestamp: "", authorName: "Alex", thread: { parentCommentId } };
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

	it("places a new comment under its target, or at the top level", () => {
		const target = findThreadTarget("reddit", { previousComments: [{ id: "c9", author: "Commenter", text: "Hi" }] }, [], "c9");

		expect(newCommentMetadata("reddit", "m1", target)).toEqual({ commentId: "reddit-user-m1", targetCommentId: "c9" });
		expect(newCommentMetadata("ao3", "m2", null)).toEqual({ commentId: "ao3-user-m2", targetCommentId: null });
	});
});

describe("targetRefOf", () => {
	it("names the comment a learner message's conversation serves: its target, or itself at the top level", () => {
		expect(targetRefOf({ thread: { commentId: "reddit-user-m1", targetCommentId: "c1" } })).toBe("c1");
		expect(targetRefOf({ thread: { commentId: "reddit-user-m2", targetCommentId: null } })).toBe("reddit-user-m2");
	});

	it("is null without thread metadata: mail is one conversation", () => {
		expect(targetRefOf({})).toBeNull();
		expect(targetRefOf({ thread: {} })).toBeNull();
	});
});

describe("ancestorRefs", () => {
	it("pops path segments from opening refs at any depth", () => {
		expect(ancestorRefs("ao3", [], "opening-0-1-2")).toEqual(["opening-0-1", "opening-0"]);
		expect(ancestorRefs("reddit", [], "opening-3")).toEqual([]);
		expect(ancestorRefs("reddit", [], null)).toEqual([]);
		// Authored opening ids carry no derivable ancestry.
		expect(ancestorRefs("ao3", [], "c1-r1")).toEqual([]);
	});

	it("walks a learner comment's target and a reply's parent through session messages", () => {
		const messages = [learnerMessage("m1", "opening-0"), castReply("2", "reddit-user-m1"), learnerMessage("m2", "reddit-agent-2")];
		expect(ancestorRefs("reddit", messages, "reddit-user-m2")).toEqual(["reddit-agent-2", "reddit-user-m1", "opening-0"]);
		expect(ancestorRefs("reddit", messages, "reddit-agent-2")).toEqual(["reddit-user-m1", "opening-0"]);
	});

	it("stops when parent refs cycle", () => {
		const messages = [castReply("1", "reddit-agent-2"), castReply("2", "reddit-agent-1")];
		expect(ancestorRefs("reddit", messages, "reddit-agent-1")).toEqual(["reddit-agent-2"]);
	});
});

describe("joinedConversation", () => {
	// Opening tree: root R (opening-0) with children A (opening-0-0) and B (opening-0-1).
	const messages = [
		learnerMessage("m1", "opening-0"), // the learner's exchange under R
		learnerMessage("m2", "opening-0-0"), // a separate exchange under A
		castReply("3", "reddit-user-m1"), // a cast reply under the learner's exchange
		castReply("4", "reddit-user-m2"), // a cast reply under A's exchange
	];
	const rootConversation: PendingConversation = { targetRef: "opening-0", learnerRefs: ["reddit-user-m1"] };
	const childConversation: PendingConversation = { targetRef: "opening-0-0", learnerRefs: ["reddit-user-m2"] };

	it("joins the conversation whose comment the new message targets, and the learner's own exchange", () => {
		expect(joinedConversation("reddit", messages, [rootConversation], "opening-0")).toBe(rootConversation);
		expect(joinedConversation("reddit", messages, [rootConversation], "reddit-user-m1")).toBe(rootConversation);
		expect(joinedConversation("reddit", messages, [rootConversation], "reddit-agent-3")).toBe(rootConversation);
		expect(joinedConversation("reddit", messages, [rootConversation], "opening-1")).toBeNull();
	});

	it("separates sibling sub-threads: with only the root conversation pending, replies to its children open new conversations", () => {
		expect(joinedConversation("reddit", messages, [rootConversation], "opening-0-0")).toBeNull();
		expect(joinedConversation("reddit", messages, [rootConversation], "opening-0-1")).toBeNull();
	});

	it("opens a new conversation when replying above an ongoing exchange", () => {
		expect(joinedConversation("reddit", messages, [childConversation], "opening-0")).toBeNull();
	});

	it("keeps a reply into A's sub-thread with A's conversation when both R and A are pending", () => {
		const both = [rootConversation, childConversation];
		expect(joinedConversation("reddit", messages, both, "opening-0-0")).toBe(childConversation);
		expect(joinedConversation("reddit", messages, both, "reddit-user-m2")).toBe(childConversation);
		expect(joinedConversation("reddit", messages, both, "reddit-agent-4")).toBe(childConversation);
		expect(joinedConversation("reddit", messages, both, "opening-0")).toBe(rootConversation);
	});

	it("joins a supplement through the conversation's folded messages and new head", () => {
		const folded: PendingConversation = { targetRef: "opening-0", learnerRefs: ["reddit-user-m1", "reddit-user-m5"] };
		expect(joinedConversation("reddit", [...messages, learnerMessage("m5", "opening-0")], [folded], "reddit-user-m5")).toBe(folded);
	});

	it("folds mail by null target and leaves legacy null-target conversations alone on threads", () => {
		const mailConversation: PendingConversation = { targetRef: null, learnerRefs: [] };
		expect(joinedConversation("apple_mail", [], [mailConversation], null)).toBe(mailConversation);
		expect(joinedConversation("apple_mail", [], [], null)).toBeNull();
		expect(joinedConversation("reddit", messages, [{ targetRef: null, learnerRefs: [] }], "opening-0")).toBeNull();
		expect(joinedConversation("reddit", messages, [{ targetRef: null, learnerRefs: [] }], null)).toBeNull();
	});

	it("leaves a legacy null-target conversation with learner messages out of threaded matching", () => {
		const legacy: PendingConversation = { targetRef: null, learnerRefs: ["reddit-user-m1"] };
		expect(joinedConversation("reddit", messages, [legacy], "reddit-user-m1")).toBeNull();
		expect(joinedConversation("reddit", messages, [legacy], "reddit-agent-3")).toBeNull();
	});

	it("resolves a multi-match to the newest head message", () => {
		const older: PendingConversation = { targetRef: "opening-0", learnerRefs: ["reddit-user-m1"] };
		const newer: PendingConversation = { targetRef: "opening-0", learnerRefs: ["reddit-user-m1", "reddit-user-m2"] };
		expect(joinedConversation("reddit", messages, [older, newer], "reddit-user-m1")).toBe(newer);
	});
});
