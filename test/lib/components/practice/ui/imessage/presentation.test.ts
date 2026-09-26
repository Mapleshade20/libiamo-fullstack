import { describe, expect, it } from "vitest";
import {
	getBubbleCorners,
	getBubbleGroupPosition,
	getLastOutgoingMessageId,
	getRenderableMessages,
	isLastOutgoingMessageRead,
} from "$lib/components/practice/ui/imessage/presentation";
import type { ChatMessage } from "$lib/practice/messages";

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
	it("leaves out pending placeholders", () => {
		const result = getRenderableMessages([
			createMessage({ id: "2", deliveryState: "pending" }),
			createMessage({ id: "3", deliveryState: "failed" }),
			createMessage({ id: "4" }),
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

	it("tucks the inner corners of grouped bubbles on the sender's side", () => {
		const messages = [createMessage({ id: "1", role: "user" }), createMessage({ id: "2", role: "user" }), createMessage({ id: "3", role: "agent" })];

		expect(getBubbleCorners(messages, 0)).toBe("rounded-br-md");
		expect(getBubbleCorners(messages, 1)).toBe("rounded-tr-md");
		expect(getBubbleCorners(messages, 2)).toBe("");
	});

	it("returns single when neighbors differ", () => {
		const messages = [createMessage({ id: "1", role: "agent" }), createMessage({ id: "2", role: "user" }), createMessage({ id: "3", role: "agent" })];

		expect(getBubbleGroupPosition(messages, 1)).toBe("single");
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

describe("isLastOutgoingMessageRead", () => {
	it("is unread while the reply watermark lags behind the persisted message id", () => {
		const read = isLastOutgoingMessageRead([createMessage({ id: "12", role: "user" })], 11);
		expect(read).toBe(false);
	});

	it("is read once the watermark reaches the message id", () => {
		const read = isLastOutgoingMessageRead([createMessage({ id: "12", role: "user" })], 12);
		expect(read).toBe(true);
	});

	it("stays unread for a fresh client-side message with a uuid id, even a digit-prefixed one", () => {
		for (const id of [crypto.randomUUID(), "8f3a9c2e-1b4d-4e5f-9a2b-6c7d8e9f0a1b"]) {
			const read = isLastOutgoingMessageRead([createMessage({ id, role: "user" })], 40);
			expect(read).toBe(false);
		}
	});

	it("is read when an agent message follows even without a watermark", () => {
		const read = isLastOutgoingMessageRead([createMessage({ id: "12", role: "user" }), createMessage({ id: "13", role: "agent" })], null);
		expect(read).toBe(true);
	});
});
