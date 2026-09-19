import { describe, expect, it } from "vitest";
import { createAo3PresentationAdapter } from "$lib/components/practice-ui/ao3/adapter";
import { buildAo3CommentTree, getAo3FallbackPseud } from "$lib/components/practice-ui/ao3/helpers";
import { createIMessagePresentationAdapter } from "$lib/components/practice-ui/imessage/adapter";
import { createRedditPresentationAdapter } from "$lib/components/practice-ui/reddit/adapter";
import { buildRedditCommentTree, getRedditFallbackAuthor } from "$lib/components/practice-ui/reddit/helpers";

describe("practice identity fallbacks", () => {
	it("keeps fallbacks deterministic and platform-scoped", () => {
		const imessage = createIMessagePresentationAdapter().resolvePresentation({ sessionId: 42, openingState: {}, userName: "Learner" }).agent.name;
		const reddit = getRedditFallbackAuthor("42:post");
		const ao3 = getAo3FallbackPseud("42:work");
		expect(imessage).toBe(
			createIMessagePresentationAdapter().resolvePresentation({ sessionId: 42, openingState: {}, userName: "Learner" }).agent.name,
		);
		expect(reddit).toMatch(/^u\/[a-z_]+$/);
		expect(ao3).toMatch(/^[a-z]+$/);
		expect(new Set([imessage, reddit, ao3]).size).toBe(3);
	});

	it("uses explicit persisted identities before fallbacks", () => {
		const reddit = createRedditPresentationAdapter().resolvePresentation({
			sessionId: 42,
			openingState: { post: { author: "u/known", title: "", body: "", subreddit: "" } },
			userName: "Learner",
		});
		const ao3 = createAo3PresentationAdapter().resolvePresentation({
			sessionId: 42,
			openingState: { authorName: "KnownPseud" },
			userName: "Learner",
		});
		expect(reddit.agent.name).toBe("u/known");
		expect(ao3.agent.name).toBe("KnownPseud");
	});

	it("fills missing thread authors without changing supplied authors", () => {
		const reddit = buildRedditCommentTree({
			sessionId: 42,
			openingState: {
				post: { author: "u/op", title: "", body: "", subreddit: "" },
				previousComments: [
					{ id: "one", author: "", text: "hello" },
					{ id: "two", author: "u/reader", text: "world" },
				],
			},
			messages: [],
		});
		const ao3 = buildAo3CommentTree({
			sessionId: 42,
			openingState: {
				workTitle: "Work",
				previousComments: [
					{ id: "one", username: "", comment: "hello" },
					{ id: "two", username: "Reader", comment: "world" },
				],
			},
			messages: [],
		});
		expect(reddit.map((comment) => comment.username)).toEqual([expect.stringMatching(/^u\//), "u/reader"]);
		expect(ao3.map((comment) => comment.username)).toEqual([expect.stringMatching(/^[a-z]+$/), "Reader"]);
	});
});
