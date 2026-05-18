import { describe, expect, it } from "vitest";
import type { ChatMessage } from "$lib/components/practice-ui/chatMessages";
import { getBubbleGroupPosition, getLastOutgoingMessageId, getRenderableMessages } from "$lib/components/practice-ui/imessage/presentation";
import { resolveAgentName } from "$lib/components/practice-ui/session.svelte";

function createMessage(overrides: Partial<ChatMessage>): ChatMessage {
	return {
		id: crypto.randomUUID(),
		role: "user",
		text: "hello",
		timestamp: "10:00",
		authorName: "Learner",
		...overrides,
	};
}

describe("getRenderableMessages", () => {
	it("filters out hidden and pending messages", () => {
		const result = getRenderableMessages([
			createMessage({ id: "1", isHidden: true }),
			createMessage({ id: "2", deliveryState: "pending" }),
			createMessage({ id: "3", deliveryState: "failed" }),
			createMessage({ id: "4", deliveryState: "sent" }),
		]);

		expect(result.map((message) => message.id)).toEqual(["3", "4"]);
	});
});

describe("getBubbleGroupPosition", () => {
	it("returns start/middle/end for grouped bubbles", () => {
		const messages = [
			createMessage({ id: "1", role: "agent" }),
			createMessage({ id: "2", role: "agent" }),
			createMessage({ id: "3", role: "agent" }),
		];

		expect(getBubbleGroupPosition(messages, 0)).toBe("start");
		expect(getBubbleGroupPosition(messages, 1)).toBe("middle");
		expect(getBubbleGroupPosition(messages, 2)).toBe("end");
	});

	it("returns single when neighbors differ", () => {
		const messages = [createMessage({ id: "1", role: "agent" }), createMessage({ id: "2", role: "user" }), createMessage({ id: "3", role: "agent" })];

		expect(getBubbleGroupPosition(messages, 1)).toBe("single");
	});

	it("returns single for out-of-range index", () => {
		const messages = [createMessage({ id: "1", role: "agent" })];
		expect(getBubbleGroupPosition(messages, 99)).toBe("single");
	});
});

describe("resolveAgentName", () => {
	it("prefers first non-user sender in opening messages", () => {
		const name = resolveAgentName(
			{
				previousMessages: [
					{ sender: "Learner", text: "hey" },
					{ sender: "Roddy", text: "hello" },
				],
			} as any,
			"Learner",
			"Agent",
		);

		expect(name).toBe("Roddy");
	});

	it("falls back to agent name when no peer sender exists", () => {
		const name = resolveAgentName(
			{
				previousMessages: [{ sender: "Learner", text: "hey" }],
			} as any,
			"Learner",
			"Agent",
		);

		expect(name).toBe("Agent");
	});

	it("falls back safely when previousMessages is malformed", () => {
		const name = resolveAgentName(
			{
				previousMessages: "broken" as any,
			},
			"Learner",
			"Agent",
		);

		expect(name).toBe("Agent");
	});
});

describe("getLastOutgoingMessageId", () => {
	it("returns the newest user message id", () => {
		const id = getLastOutgoingMessageId([
			createMessage({ id: "1", role: "agent" }),
			createMessage({ id: "2", role: "user" }),
			createMessage({ id: "3", role: "agent" }),
			createMessage({ id: "4", role: "user" }),
		]);

		expect(id).toBe("4");
	});

	it("returns null when there is no user message", () => {
		const id = getLastOutgoingMessageId([createMessage({ id: "1", role: "agent" })]);
		expect(id).toBeNull();
	});
});
