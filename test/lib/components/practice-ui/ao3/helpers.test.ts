import { describe, expect, it } from "vitest";
import {
	buildAo3CommentTree,
	findAo3Target,
	flattenAo3Comments,
	getAo3AdditionalTags,
	getAo3AuthorName,
} from "$lib/components/practice-ui/ao3/helpers";
import type { ChatMessage } from "$lib/components/practice-ui/chatMessages";
import { buildChatMessages } from "$lib/components/practice-ui/chatMessages";

describe("AO3 helpers", () => {
	const openingState = {
		workTitle: "Paths of Remnant",
		authorName: "HikariKitsune02",
		additionalTags: ["Magic", "No Aura"],
		tags: ["No Aura", "Slow Burn"],
		previousComments: [
			{
				id: "c1",
				username: "WispPattio",
				comment: "I’d love to know the differences.",
				replies: [
					{ id: "c1-r1", username: "HikariKitsune02", comment: "They do not have Semblances." },
					{ username: "Ranjira", comment: "Silver Eyes could work here." },
				],
			},
		],
	};

	it("flattens nested opening comments with stable ids", () => {
		const result = flattenAo3Comments(openingState.previousComments);

		expect(result.map((comment) => comment.id)).toEqual(["c1", "c1-r1", "opening-0-1"]);
		expect(result[2]).toMatchObject({ username: "Ranjira", depth: 1, parentId: "c1" });
	});

	it("finds targets and resolves author/tag defaults", () => {
		expect(getAo3AuthorName(openingState)).toBe("HikariKitsune02");
		expect(getAo3AdditionalTags(openingState)).toEqual(["Magic", "No Aura", "Slow Burn"]);
		expect(findAo3Target(openingState, "c1-r1")?.username).toBe("HikariKitsune02");
		expect(findAo3Target(openingState, "missing")).toBeNull();
	});

	it("attaches session comments under their AO3 targets", () => {
		const messages: ChatMessage[] = [
			{
				id: "u1",
				role: "user",
				text: "Can you say more?",
				timestamp: "now",
				authorName: "Learner",
				clientMessageId: "msg-1",
				thread: { commentId: "ao3-user-msg-1", targetCommentId: "c1", responderName: "WispPattio", mode: "reply" },
			},
			{
				id: "a1",
				role: "agent",
				text: "Sure, I meant the worldbuilding.",
				timestamp: "now",
				authorName: "WispPattio",
				clientMessageId: "msg-1",
				thread: { commentId: "ao3-agent-msg-1", parentCommentId: "ao3-user-msg-1", responderName: "WispPattio" },
			},
		];

		const tree = buildAo3CommentTree({ openingState, messages });
		const root = tree[0];
		expect(root.replies.map((reply) => reply.id)).toContain("ao3-user-msg-1");
		const userComment = root.replies.find((reply) => reply.id === "ao3-user-msg-1");
		expect(userComment?.replies[0]).toMatchObject({ id: "ao3-agent-msg-1", username: "WispPattio" });
	});

	it("nests async-delivered author replies under their comment with the responder name", () => {
		// Row shapes exactly as the async worker writes them: the user comment
		// carries its thread metadata at send time, the delivered assistant
		// message carries the responder identity and parent copied from it.
		const rawMessages = [
			{
				id: 101,
				role: "user",
				content: "Loved this chapter!",
				createdAt: "2026-08-21 12:40:00",
				llmMetadata: {
					clientMessageId: "msg-1",
					thread: { commentId: "ao3-user-msg-1", targetCommentId: null, responderName: "HikariKitsune02", mode: "work" },
				},
			},
			{
				id: 102,
				role: "assistant",
				content: "Thank you so much for reading!",
				createdAt: "2026-08-21 15:53:00",
				llmMetadata: {
					assistantAuthorName: "HikariKitsune02",
					thread: { parentCommentId: "ao3-user-msg-1", responderName: "HikariKitsune02", mode: "reply" },
					replyToMessageId: 101,
					asyncDelivery: true,
				},
			},
		];

		const messages = buildChatMessages({
			rawMessages,
			formatTimestamp: () => "Later",
			userName: "Learner",
			// the session persona fallback must never win over the responder identity
			agentName: "GamerPro99",
			labels: { retryFailedMessage: "Failed", stillProcessingMessage: "Processing" },
		});

		const tree = buildAo3CommentTree({ openingState, messages });
		const userComment = tree.find((comment) => comment.id === "ao3-user-msg-1");
		expect(userComment?.username).toBe("Learner");
		expect(userComment?.replies).toHaveLength(1);
		expect(userComment?.replies[0]).toMatchObject({ text: "Thank you so much for reading!", username: "HikariKitsune02" });
		// no stray top-level agent comment
		expect(tree.filter((comment) => comment.role === "agent")).toHaveLength(0);
	});

	it("excludes pending placeholders from the comment tree (AO3 shows no processing state)", () => {
		const messages: ChatMessage[] = [
			{
				id: "u1",
				role: "user",
				text: "Loved this chapter!",
				timestamp: "now",
				authorName: "Learner",
				clientMessageId: "msg-1",
			},
			{
				id: "a-pending",
				role: "agent",
				text: "Reply is still processing. Retry in a moment.",
				timestamp: "now",
				authorName: "HikariKitsune02",
				clientMessageId: "msg-1",
				deliveryState: "pending",
			},
		];

		const tree = buildAo3CommentTree({ openingState, messages });
		const flattened = flattenAo3Comments(tree).map((comment) => comment.id);
		expect(flattened).not.toContain("a-pending");
	});
});
