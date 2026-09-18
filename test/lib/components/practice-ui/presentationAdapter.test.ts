import { describe, expect, it } from "vitest";
import { createAo3PresentationAdapter } from "$lib/components/practice-ui/ao3/adapter";
import { buildChatMessages } from "$lib/components/practice-ui/chatMessages";
import { createDiscordPresentationAdapter } from "$lib/components/practice-ui/discord/adapter";
import { initUserPool } from "$lib/components/practice-ui/discord/userPool";
import { createIMessagePresentationAdapter } from "$lib/components/practice-ui/imessage/adapter";
import { normalizeOpeningState } from "$lib/components/practice-ui/messageTransformer";
import { createRedditPresentationAdapter } from "$lib/components/practice-ui/reddit/adapter";
import type { PracticePresentationAdapter } from "$lib/components/practice-ui/types";

describe("practice presentation adapters", () => {
	it("uses the same named Discord Agent for members and message presentation", () => {
		const adapter = createDiscordPresentationAdapter();
		const openingState = adapter.normalizeOpeningState({ previousMessages: [{ sender: "Maya", text: "Hello" }] });
		const presentation = adapter.resolvePresentation({ sessionId: 17, openingState, userName: "Learner" });
		expect(presentation.agent.name).toBe("Maya");
		expect(presentation.context.agentUser.name).toBe(presentation.agent.name);
		expect(presentation.context.agentUser.color).toBe(presentation.agent.accentClass);
		expect([...presentation.context.onlineUsers, ...presentation.context.offlineUsers].some((user) => user.name === "Maya")).toBe(false);
	});
	it("reuses one Discord pool per session and resolves a new pool on replacement", () => {
		const adapter = createDiscordPresentationAdapter();
		const openingState = adapter.normalizeOpeningState({ serverName: "Workshop", channelName: "general" });
		const input = { sessionId: 17, openingState, userName: "Learner" };
		const first = adapter.resolvePresentation(input);
		expect(first.context).toEqual(initUserPool(17));
		expect(adapter.resolvePresentation(input).context).toBe(first.context);
		const replacement = adapter.resolvePresentation({ ...input, sessionId: 28 });
		expect(replacement.context).toEqual(initUserPool(28));
		expect(replacement.context).not.toBe(first.context);
		expect(openingState).toMatchObject({ serverName: "Workshop", channelName: "general" });
	});

	function checkAdapter<Opening, Context>(adapter: PracticePresentationAdapter<Opening, Context>) {
		const openingState = adapter.normalizeOpeningState({
			previousMessages: [{ sender: "Learner", text: "Hello" }, { author: "Named author", content: "Reply" }, { text: "Anonymous" }],
		});
		const presentation = adapter.resolvePresentation({ sessionId: 17, openingState, userName: "Learner" });
		expect(presentation.agent).toEqual({ name: "Named author" });
		const messages = adapter.buildOpeningMessages({ openingState, presentation, userName: "Learner", avatarUrl: "avatar.png", earlier: "Earlier" });
		expect(messages.map(({ id, authorName }) => [id, authorName])).toEqual([
			["opening-0-Learner", "Learner"],
			["opening-1-Named author", "Named author"],
			["opening-2-Named author", "Named author"],
		]);
		expect(messages[0].avatar).toBe("avatar.png");
		expect(messages[1].avatarColor).toBeUndefined();
		const empty = adapter.normalizeOpeningState(null);
		expect(adapter.resolvePresentation({ sessionId: 17, openingState: empty, userName: "Learner" }).agent.name).toBe("Agent");
	}
	it.each([
		["iMessage", () => checkAdapter(createIMessagePresentationAdapter())],
	] as const)("preserves %s seeded identity, opening authors, and message ordering", (_name, check) => check());

	it("keeps AO3 identity in work metadata instead of the participant pool", () => {
		const adapter = createAo3PresentationAdapter();
		const openingState = adapter.normalizeOpeningState({ authorName: "Fic Author", previousComments: [{ username: "Reader", text: "Hello" }] });
		const presentation = adapter.resolvePresentation({ sessionId: 17, openingState, userName: "Learner" });
		expect(presentation.agent.name).toBe("Fic Author");
		expect(presentation.context).toBeUndefined();
		expect(adapter.buildOpeningMessages({ openingState, presentation, userName: "Learner", avatarUrl: "avatar.png", earlier: "Earlier" })).toEqual(
			[],
		);
	});

	it.each([
		createRedditPresentationAdapter,
		createAo3PresentationAdapter,
	])("restores retry targets from the original persisted user message", (createAdapter) => {
		const messages = buildChatMessages({
			rawMessages: [
				{
					id: 4,
					role: "user",
					content: "Nested reply",
					createdAt: new Date("2026-09-18T00:00:00Z"),
					llmMetadata: {
						clientMessageId: "client-4",
						failed: true,
						thread: { commentId: "thread-user-4", parentCommentId: "parent", targetCommentId: "parent" },
					},
				},
			],
			formatTimestamp: () => "time",
			userName: "Learner",
			agentName: "Agent",
			labels: { retryFailedMessage: "Retry", stillProcessingMessage: "Pending" },
		});
		expect(createAdapter().retryFields(messages[0])).toEqual({ threadTargetCommentId: "parent" });
		expect(messages[1].thread?.parentCommentId).toBe("thread-user-4");
		expect(createAdapter().retryFields(undefined)).toEqual({});
	});

	it("normalizes malformed opening state without introducing surface fields", () => {
		expect(normalizeOpeningState(null)).toEqual({});
		expect(normalizeOpeningState({ previousMessages: [null, 3, [], { text: "Valid" }] })).toEqual({ previousMessages: [{ text: "Valid" }] });
	});
});
