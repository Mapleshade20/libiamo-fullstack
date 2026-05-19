import { describe, expect, it } from "vitest";
import type { ChatMessage } from "$lib/components/practice-ui/chatMessages";
import { buildChatMessages, getSessionSnapshot, stableMetadataSnapshot, updateMessageById } from "$lib/components/practice-ui/chatMessages";

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
		expect(result[1].thread).toBeUndefined();
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

	it("treats an 'agent' role message as an assistant reply in the same turn", () => {
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
				{ id: 2, role: "agent", content: "Hi", createdAt: new Date("2026-01-01T10:01:00Z") },
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

	it("respects custom isHidden callback", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{ id: 1, role: "user", content: "visible msg", createdAt: new Date("2026-01-01T10:00:00Z") },
				{ id: 2, role: "user", content: "hidden msg", createdAt: new Date("2026-01-01T10:01:00Z") },
			],
			isHidden: (m) => m.content === "hidden msg",
		});

		expect(result).toHaveLength(2);
		expect(result[0].isHidden).toBe(false);
		expect(result[1].isHidden).toBe(true);
	});

	it("marks mapped message as hidden when llm metadata hidden is true", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Hidden by metadata",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata: { hidden: true },
				},
			],
		});

		expect(result).toHaveLength(1);
		expect(result[0].isHidden).toBe(true);
	});

	it("preserves llm metadata for UI-specific message rendering", () => {
		const llmMetadata = { clientMessageId: "mail-1", mailBodyHtml: '<div style="text-align: center">Hello</div>' };
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "To: Maya\nSubject: Hi\n\nHello",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata,
				},
				{ id: 2, role: "assistant", content: "Done", createdAt: new Date("2026-01-01T10:01:00Z") },
			],
		});

		expect(result[0].llmMetadata).toBe(llmMetadata);
	});

	it("uses display content and AO3 assistant author metadata when present", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Prompt-only context",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata: {
						clientMessageId: "msg-ao3",
						displayContent: "Visible learner comment",
						thread: { commentId: "ao3-user-msg-ao3", targetCommentId: "c1", responderName: "Commenter" },
					},
				},
				{
					id: 2,
					role: "assistant",
					content: "Visible reply",
					createdAt: new Date("2026-01-01T10:01:00Z"),
					llmMetadata: {
						clientMessageId: "msg-ao3",
						assistantAuthorName: "Commenter",
						thread: { commentId: "ao3-agent-msg-ao3", parentCommentId: "ao3-user-msg-ao3", responderName: "Commenter" },
					},
				},
			],
		});

		expect(result[0]).toMatchObject({ text: "Visible learner comment", thread: { commentId: "ao3-user-msg-ao3" } });
		expect(result[1]).toMatchObject({ authorName: "Commenter", thread: { parentCommentId: "ao3-user-msg-ao3" } });
	});

	it("treats persisted timestamp strings without offsets as UTC", () => {
		const seenDates: Date[] = [];
		buildChatMessages({
			...baseOptions,
			formatTimestamp: (date) => {
				seenDates.push(date);
				return "formatted";
			},
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Hello",
					createdAt: "2026-05-17 05:01:00",
				},
			],
		});

		expect(seenDates[0]?.toISOString()).toBe("2026-05-17T05:01:00.000Z");
	});

	it("normalizes persisted timestamp strings that include offsets", () => {
		const seenDates: Date[] = [];
		buildChatMessages({
			...baseOptions,
			formatTimestamp: (date) => {
				seenDates.push(date);
				return "formatted";
			},
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Hello",
					createdAt: "2026-05-17 05:01:00+08:00",
				},
			],
		});

		expect(seenDates[0]?.toISOString()).toBe("2026-05-16T21:01:00.000Z");
	});

	it("formats persisted and optimistic timestamps consistently for the same instant and timezone", () => {
		const formatTimestamp = (date: Date) =>
			date.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
				timeZone: "Asia/Shanghai",
			});
		const optimisticTimestamp = formatTimestamp(new Date("2026-05-17T05:01:00Z"));

		const result = buildChatMessages({
			...baseOptions,
			formatTimestamp,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Hello",
					createdAt: "2026-05-17 05:01:00",
				},
			],
		});

		expect(result[0]?.timestamp).toBe(optimisticTimestamp);
	});

	it("adds AO3 metadata to retry placeholders only for AO3 persisted messages", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Prompt-only context",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata: {
						clientMessageId: "msg-ao3",
						failed: true,
						displayContent: "Visible learner comment",
						thread: { commentId: "ao3-user-msg-ao3", targetCommentId: "c1", responderName: "Commenter" },
					},
				},
			],
		});

		expect(result[1]).toMatchObject({
			thread: { commentId: "ao3-agent-msg-ao3", parentCommentId: "ao3-user-msg-ao3", targetCommentId: "c1", responderName: "Commenter" },
		});
	});

	it("uses a distinct generic retry agent comment id when the user comment id has no user marker", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 12,
					role: "user",
					content: "Prompt-only context",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata: {
						clientMessageId: "msg-custom",
						failed: true,
						thread: { commentId: "custom-comment-id", targetCommentId: "c1", responderName: "Commenter" },
					},
				},
			],
		});

		expect(result[1]).toMatchObject({
			thread: { commentId: "thread-agent-msg-custom", parentCommentId: "custom-comment-id" },
		});
		expect(result[1].thread?.commentId).not.toBe(result[1].thread?.parentCommentId);
	});

	it("ignores malformed llm metadata and avoids retry placeholders", () => {
		const result = buildChatMessages({
			...baseOptions,
			rawMessages: [
				{
					id: 1,
					role: "user",
					content: "Hello",
					createdAt: new Date("2026-01-01T10:00:00Z"),
					llmMetadata: "not-an-object" as any,
				},
			],
		});

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: "1",
			role: "user",
			text: "Hello",
			clientMessageId: undefined,
		});
	});
});

describe("session snapshots", () => {
	it("includes metadata state changes while bounding mail body HTML", () => {
		const largeMailBody = `<p>${"Hello ".repeat(200)}</p>`;

		const snapshot = getSessionSnapshot({
			status: "active",
			messages: [
				{
					id: 1,
					status: "sent",
					content: "To: Maya\nSubject: Hi\n\nHello",
					createdAt: "2026-01-01 10:00:00",
					llmMetadata: { clientMessageId: "mail-1", failed: true, hidden: false, mailBodyHtml: largeMailBody },
				},
			],
		});

		expect(snapshot).toContain('"failed":true');
		expect(snapshot).toContain('"mailBodyHtml"');
		expect(snapshot).not.toContain(largeMailBody);
		expect(snapshot.length).toBeLessThan(260);
	});

	it("uses different bounded mail body snapshots for changed HTML", () => {
		expect(stableMetadataSnapshot({ mailBodyHtml: "<p>Hello</p>" })).not.toEqual(stableMetadataSnapshot({ mailBodyHtml: "<p>Hello!</p>" }));
	});
});

describe("updateMessageById", () => {
	const sampleMessages: ChatMessage[] = [
		{ id: "a", role: "user", text: "first", timestamp: "", authorName: "" },
		{ id: "b", role: "agent", text: "second", timestamp: "", authorName: "" },
		{ id: "c", role: "user", text: "third", timestamp: "", authorName: "" },
	];

	it("updates the matching message", () => {
		const result = updateMessageById(sampleMessages, "b", (m) => ({ ...m, text: "updated" }));

		expect(result[1].text).toBe("updated");
		expect(result[0].text).toBe("first");
		expect(result[2].text).toBe("third");
	});

	it("returns original array when no id matches", () => {
		const result = updateMessageById(sampleMessages, "nonexistent", (m) => ({ ...m, text: "changed" }));

		expect(result).toEqual(sampleMessages);
	});

	it("does not mutate the original array", () => {
		const original = [...sampleMessages];
		updateMessageById(sampleMessages, "a", (m) => ({ ...m, isHidden: true }));

		expect(sampleMessages).toEqual(original);
	});

	it("passes the correct message to the updater", () => {
		let capturedId = "";
		updateMessageById(sampleMessages, "c", (m) => {
			capturedId = m.id;
			return { ...m };
		});

		expect(capturedId).toBe("c");
	});

	it("handles empty array", () => {
		const result = updateMessageById([], "any", (m) => ({ ...m, text: "x" }));

		expect(result).toHaveLength(0);
	});
});
