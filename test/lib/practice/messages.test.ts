import { describe, expect, it } from "vitest";
import {
	buildChatMessages,
	buildOpeningMessages,
	type PersistedPracticeMessage,
	parsePersistedMessageDate,
	resolveOpeningAgentName,
} from "$lib/practice/messages";

function message(id: number, role: string, content: string, llmMetadata?: unknown, minute = id): PersistedPracticeMessage {
	return { id, role, content, createdAt: new Date(Date.UTC(2026, 0, 1, 10, minute)), llmMetadata };
}

function build(rawMessages: PersistedPracticeMessage[]) {
	return buildChatMessages({ rawMessages, formatTimestamp: (date) => date.toISOString().slice(11, 16), userName: "Learner", agentName: "Agent" });
}

describe("buildChatMessages", () => {
	it("follows a failed learner turn with a failed placeholder carrying the persisted error and retry text", () => {
		const result = build([message(1, "user", "Hello", { clientMessageId: "c1", failed: true, failureError: "Budget exhausted." })]);

		expect(result.map((item) => [item.id, item.role, item.deliveryState])).toEqual([
			["1", "user", undefined],
			["retry-1", "agent", "failed"],
		]);
		expect(result[1]).toMatchObject({ error: "Budget exhausted.", clientMessageId: "c1", retryText: "Hello", text: "" });
	});

	it("marks an unanswered learner turn as pending, but not one the agent chose not to answer", () => {
		expect(build([message(1, "user", "Hi", { clientMessageId: "c1" })])[1]?.deliveryState).toBe("pending");
		expect(build([message(1, "user", "Hi", { clientMessageId: "c1", noReply: true })])).toHaveLength(1);
	});

	it("recognises a reply to the same turn by client message id, even when it was stored first", () => {
		const result = build([message(2, "assistant", "Hey", { clientMessageId: "c1" }, 1), message(1, "user", "Hi", { clientMessageId: "c1" }, 2)]);

		expect(result.some((item) => item.deliveryState)).toBe(false);
	});

	it("clears every pending placeholder of a burst when one folded reply lands after it", () => {
		const result = build([
			message(1, "user", "One", { clientMessageId: "c1" }),
			message(2, "user", "Two", { clientMessageId: "c2" }),
			message(3, "assistant", "Answer to both"),
		]);

		expect(result.map((item) => item.id)).toEqual(["1", "2", "3"]);
	});

	it("keeps a failed turn's placeholder when a later turn is answered", () => {
		const result = build([
			message(1, "user", "Failed", { clientMessageId: "c1", failed: true }),
			message(2, "user", "Next", { clientMessageId: "c2" }),
			message(3, "assistant", "Reply", { clientMessageId: "c2" }),
		]);

		expect(result.find((item) => item.id === "retry-1")?.deliveryState).toBe("failed");
	});

	it("drops hidden messages and prefers display content and the stored responder name", () => {
		const result = build([
			message(1, "user", "Hidden", { hidden: true }),
			message(2, "user", "wrapped prompt", { displayContent: "What the learner typed" }),
			message(3, "assistant", "Reply", { assistantAuthorName: "Commenter" }),
		]);

		expect(result.map((item) => [item.text, item.authorName])).toEqual([
			["What the learner typed", "Learner"],
			["Reply", "Commenter"],
		]);
	});

	it("orders by time, then by id, and treats offset-less timestamps as UTC", () => {
		const result = build([
			{ id: 2, role: "assistant", content: "B", createdAt: "2026-01-01 10:00:00" },
			{ id: 1, role: "user", content: "A", createdAt: "2026-01-01T10:00:00Z" },
		]);

		expect(result.map((item) => item.text)).toEqual(["A", "B"]);
		expect(parsePersistedMessageDate("2026-01-01 10:00:00").toISOString()).toBe("2026-01-01T10:00:00.000Z");
	});

	it("places a threaded placeholder under the learner comment it answers", () => {
		const thread = { commentId: "reddit-user-c1", targetCommentId: "opening-0", responderName: "OP" };
		const result = build([message(1, "user", "Reply", { clientMessageId: "c1", failed: true, thread })]);

		expect(result[1]).toMatchObject({ authorName: "OP", thread: { commentId: "reddit-agent-c1", parentCommentId: "reddit-user-c1" } });
	});
});

describe("opening chat history", () => {
	const opening = {
		previousMessages: [
			{ sender: "Learner", text: "hey" },
			{ sender: "Roddy", text: "hi!", timestamp: "Yesterday" },
			{ sender: "Roddy", text: " " },
		],
	};

	it("maps authored lines by sender and skips empty ones", () => {
		expect(buildOpeningMessages(opening, "Learner", "Agent").map((item) => [item.role, item.authorName, item.timestamp])).toEqual([
			["user", "Learner", ""],
			["agent", "Roddy", "Yesterday"],
		]);
	});

	it("names the counterpart after the first sender who is not the learner", () => {
		expect(resolveOpeningAgentName(opening, "Learner")).toBe("Roddy");
		expect(resolveOpeningAgentName({}, "Learner")).toBeNull();
	});
});
