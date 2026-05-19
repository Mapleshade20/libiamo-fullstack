import { describe, expect, it } from "vitest";
import {
	buildAo3CommentTree,
	buildAo3UserPrompt,
	findAo3Target,
	flattenAo3Comments,
	getAo3AdditionalTags,
	getAo3AuthorName,
} from "$lib/components/practice-ui/ao3/helpers";
import type { ChatMessage } from "$lib/components/practice-ui/chatMessages";

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

	it("builds per-turn prompt for direct work comments and targeted replies", () => {
		const direct = buildAo3UserPrompt({ openingState, comment: "Loved this!", target: null, responderName: "HikariKitsune02" });
		expect(direct).toContain("new top-level AO3 comment");
		expect(direct).toContain("roleplay as the work author, HikariKitsune02");

		const target = findAo3Target(openingState, "c1");
		if (!target) throw new Error("target missing");
		const reply = buildAo3UserPrompt({ openingState, comment: "What changed?", target, responderName: target.username });
		expect(reply).toContain("Comment author you must roleplay as: WispPattio");
		expect(reply).toContain("Original comment: I’d love to know the differences.");
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
});
