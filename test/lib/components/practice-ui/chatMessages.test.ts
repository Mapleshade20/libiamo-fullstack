import { describe, expect, it } from "vitest";
import { buildChatMessages } from "$lib/components/practice-ui/chatMessages";

const labels = {
	retryFailedMessage: "Agent reply failed. Click Retry to try again.",
	stillProcessingMessage: "Agent is still processing. Retry in a moment.",
};

const baseOptions = {
	formatTimestamp: () => "10:00 AM",
	userName: "Learner",
	agentName: "Agent",
	avatarUrl: "/avatar.png",
	agentColor: "bg-blue",
	labels,
};

describe("buildChatMessages", () => {
	it("adds a failed retry placeholder after a failed persisted user turn", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Hello",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata: { clientMessageId: "msg-1", failed: true },
				},
			],
		});

		expect(result).toHaveLength(2);
		expect(result[1]).toMatchObject({
			id: "retry-1",
			role: "agent",
			text: labels.retryFailedMessage,
			deliveryState: "failed",
			clientMessageId: "msg-1",
			retryText: "Hello",
		});
	});

	it("adds a pending retry placeholder after an unfinished persisted user turn", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Hello",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata: { clientMessageId: "msg-1", failed: false },
				},
			],
		});

		expect(result[1]).toMatchObject({
			id: "retry-1",
			text: labels.stillProcessingMessage,
			deliveryState: "pending",
			clientMessageId: "msg-1",
			retryText: "Hello",
		});
	});

	it("does not add a retry placeholder when the same turn already has an assistant reply", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Hello",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata: { clientMessageId: "msg-1", failed: false },
				},
				{ id: 2, role: "assistant", content: "Hi", createdAt: new Date("2026-01-01T10:01:00Z") },
			],
		});

		expect(result.map((message) => message.id)).toEqual(["1", "2"]);
	});

	it("does not use a later turn's assistant reply to satisfy an unfinished turn", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "First",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata: { clientMessageId: "msg-1", failed: true },
				},
				{
					id: 2,
					role: "user",
					content: "Second",
					createdAt: new Date("2026-01-01T10:01:00Z"),
					llmMetadata: { clientMessageId: "msg-2", failed: false },
				},
				{ id: 3, role: "assistant", content: "Reply to second", createdAt: new Date("2026-01-01T10:02:00Z") },
			],
		});

		expect(result.map((message) => message.id)).toEqual(["1", "retry-1", "2", "3"]);
	});
});
