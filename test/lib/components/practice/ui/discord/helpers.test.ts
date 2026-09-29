import { describe, expect, it } from "vitest";
import {
	getFirstUnansweredUserMessageId,
	getMentionQuery,
	hasAgentStartedComposing,
	highlightMentions,
	mentionsName,
} from "$lib/components/practice/ui/discord/helpers";
import type { ChatMessage } from "$lib/practice/messages";

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

describe("discord mentions", () => {
	it("wraps known @names as pills, longest name first, outside code spans", () => {
		expect(highlightMentions("@Nova and @NovaStar, `@Nova` stays code, email a@Nova no", ["Nova", "NovaStar"])).toBe(
			'<span class="discord-mention">@Nova</span> and <span class="discord-mention">@NovaStar</span>, `@Nova` stays code, email a@Nova no',
		);
	});

	it("escapes names and leaves unknown @words alone", () => {
		expect(highlightMentions("hi @<b> and @nobody", ["<b>"])).toBe('hi <span class="discord-mention">@&#60;b&#62;</span> and @nobody');
	});

	it("tells whether a message pings someone, in any script", () => {
		expect(mentionsName("おい @天元 見て", "天元")).toBe(true);
		expect(mentionsName("天元 said so", "天元")).toBe(false);
	});

	it("finds the @query right before the caret, not after it", () => {
		expect(getMentionQuery("hey @Lu", 7)).toEqual({ start: 4, query: "Lu" });
		expect(getMentionQuery("hey @Lu and more", 7)).toEqual({ start: 4, query: "Lu" });
		expect(getMentionQuery("@天", 2)).toEqual({ start: 0, query: "天" });
		expect(getMentionQuery("mail@host", 9)).toBeNull();
		expect(getMentionQuery("hey @Lu and more", 16)).toBeNull();
	});
});
