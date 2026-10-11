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

	it("gives a folded message no placeholder of its own: its wait is the head's wait", () => {
		const messages = build([
			message(1, "user", "First question", { clientMessageId: "m1", foldedInto: 2 }),
			message(2, "user", "Actually, one more thing", { clientMessageId: "m2" }),
			message(3, "user", "Failed but folded", { clientMessageId: "m3", failed: true, failureError: "boom", foldedInto: 2 }),
		]);

		// the head carries the chain's shared wait; the folded messages get neither a pending
		// placeholder nor a failed retry affordance
		expect(messages.filter((entry) => entry.deliveryState === "pending")).toHaveLength(1);
		expect(messages.filter((entry) => entry.deliveryState === "failed")).toHaveLength(0);
		expect(messages.map((entry) => entry.id)).toEqual(["1", "2", "retry-2", "3"]);
	});

	it("clears a pre-arrival thread message's placeholder with any later reply, whatever branch it landed in", () => {
		// Sessions from before arrival-based replies carry no inputMessageId: their answers may sit
		// outside the learner's branch, and no batch is left to settle them.
		const messages = build([
			message(1, "user", "Question A", { clientMessageId: "m1", thread: { commentId: "reddit-user-m1", targetCommentId: "c1" } }),
			message(2, "assistant", "Top-level take", { assistantAuthorName: "alex" }),
		]);

		expect(messages.some((entry) => entry.deliveryState === "pending")).toBe(false);
	});

	it("keeps a newer mail message waiting when an older conversation's reply lands", () => {
		// two mail conversations: A's taker is composing when B is sent, so B gets its own; when
		// A's reply arrives, only A's placeholder resolves
		const messages = build([
			message(1, "user", "To: Maya\nSubject: A\n\nA", { clientMessageId: "m1", arrival: true }),
			message(2, "user", "To: Maya\nSubject: B\n\nB", { clientMessageId: "m2", arrival: true }),
			message(3, "assistant", "Answer to A", { inputMessageId: 1, asyncDelivery: true }),
			// a world moment names no message: it resolves nothing
			message(4, "assistant", "Meanwhile", { inputMessageId: null, asyncDelivery: true }),
		]);

		expect(messages.filter((entry) => entry.deliveryState === "pending").map((entry) => entry.id)).toEqual(["retry-2"]);
	});

	it("resolves a folded mail message's shared wait when the head's reply lands", () => {
		const messages = build([
			message(1, "user", "To: Maya\nSubject: A\n\nFirst", { clientMessageId: "m1", foldedInto: 2 }),
			message(2, "user", "To: Maya\nSubject: A\n\nMore", { clientMessageId: "m2" }),
			message(3, "assistant", "Answer", { inputMessageId: 2, asyncDelivery: true }),
		]);

		expect(messages.some((entry) => entry.deliveryState === "pending")).toBe(false);
	});

	it("does not clear an earlier mail message's wait when a later conversation goes silent", () => {
		// A is still generating when B is sent as its own conversation; B's takers choose
		// silence, which settles B (and only B) — A keeps waiting
		const messages = build([
			message(1, "user", "To: Maya\nSubject: A\n\nA", { clientMessageId: "m1", arrival: true }),
			message(2, "user", "To: Maya\nSubject: B\n\nB", { clientMessageId: "m2", arrival: true, noReply: true }),
		]);

		expect(messages.filter((entry) => entry.deliveryState === "pending").map((entry) => entry.id)).toEqual(["retry-1"]);
	});

	it("resolves a threaded message by explicit ownership even when its reply lands top-level", () => {
		// the protocol allows a reply to be delivered as a top-level comment: the explicit
		// inputMessageId ownership decides, not the branch it happens to sit in
		const messages = build([
			message(1, "user", "Question A", { clientMessageId: "m1", arrival: true, thread: { commentId: "reddit-user-m1", targetCommentId: "c1" } }),
			message(2, "user", "Question B", { clientMessageId: "m2", arrival: true, thread: { commentId: "reddit-user-m2", targetCommentId: "c2" } }),
			message(3, "assistant", "A's answer, delivered top level", { inputMessageId: 1, asyncDelivery: true }),
		]);
		expect(messages.filter((entry) => entry.deliveryState === "pending").map((entry) => entry.id)).toEqual(["retry-2"]);
	});

	it("settles a marked delivery only by its ownership, never by the branch it sits in", () => {
		// the reply names B but is nested under A's comment: B resolves, A keeps waiting
		const messages = build([
			message(1, "user", "Question A", { clientMessageId: "m1", arrival: true, thread: { commentId: "reddit-user-m1", targetCommentId: "c1" } }),
			message(2, "user", "Question B", { clientMessageId: "m2", arrival: true, thread: { commentId: "reddit-user-m2", targetCommentId: "c2" } }),
			message(3, "assistant", "B's answer, nested under A", {
				inputMessageId: 2,
				asyncDelivery: true,
				thread: { parentCommentId: "reddit-user-m1" },
			}),
		]);

		expect(messages.filter((entry) => entry.deliveryState === "pending").map((entry) => entry.id)).toEqual(["retry-1"]);
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
