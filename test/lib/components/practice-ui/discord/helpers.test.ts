import { describe, expect, it } from "vitest";
import type { ChatMessage } from "$lib/components/practice-ui/chatMessages";
import { getFirstUnansweredUserMessageId, hasAgentStartedComposing } from "$lib/components/practice-ui/discord/helpers";

describe("discord typing gate helpers", () => {
	function msg(id: string, role: "user" | "agent"): ChatMessage {
		return { id, role, text: "hi", timestamp: "now", authorName: role === "user" ? "Learner" : "FrostByte" };
	}

	it("finds the earliest unanswered user message across a burst", () => {
		const messages = [msg("301", "user"), msg("302", "user"), msg("303", "agent"), msg("304", "user"), msg("305", "user")];
		expect(getFirstUnansweredUserMessageId(messages)).toBe(304);
	});

	it("ignores fresh client-side messages without numeric ids", () => {
		const messages = [msg("client-uuid", "user")];
		expect(getFirstUnansweredUserMessageId(messages)).toBeNull();
		expect(hasAgentStartedComposing(messages, 999)).toBe(false);
	});

	it("treats every user message as unanswered before the first agent reply", () => {
		const messages = [msg("301", "user"), msg("302", "user")];
		expect(getFirstUnansweredUserMessageId(messages)).toBe(301);
	});

	it("typing starts only once the claim watermark reaches the first unanswered message", () => {
		const messages = [msg("301", "user"), msg("302", "user")];
		// before the worker claims: no typing even while the batch is pending
		expect(hasAgentStartedComposing(messages, null)).toBe(false);
		expect(hasAgentStartedComposing(messages, 300)).toBe(false);
		// claim advances the watermark to the batch anchor (burst-first message)
		expect(hasAgentStartedComposing(messages, 301)).toBe(true);
		expect(hasAgentStartedComposing(messages, 302)).toBe(true);
	});

	it("pending placeholders do not count as answers while the reply is pending", () => {
		const messages: ChatMessage[] = [msg("485", "user"), { ...msg("agent-pending", "agent"), deliveryState: "pending" as const }];
		expect(getFirstUnansweredUserMessageId(messages)).toBe(485);
		expect(hasAgentStartedComposing(messages, 484)).toBe(false);
		expect(hasAgentStartedComposing(messages, 485)).toBe(true);
	});

	it("stops once every user message has been answered", () => {
		const messages = [msg("301", "user"), msg("302", "agent")];
		expect(getFirstUnansweredUserMessageId(messages)).toBeNull();
		expect(hasAgentStartedComposing(messages, 302)).toBe(false);
	});
});
