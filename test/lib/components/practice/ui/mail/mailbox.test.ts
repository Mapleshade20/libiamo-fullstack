import { describe, expect, it } from "vitest";
import { buildMailboxes } from "$lib/components/practice/ui/mail/mailbox";
import type { ChatMessage } from "$lib/practice/messages";

const counterpart = { name: "Maya Chen", address: "maya@x.example" };

function chat(id: string, role: ChatMessage["role"], text: string, deliveryState?: ChatMessage["deliveryState"]): ChatMessage {
	return { id, role, text, timestamp: `t${id}`, authorName: role === "user" ? "Learner" : "Maya Chen", deliveryState };
}

describe("buildMailboxes", () => {
	it("files opening emails and replies in the inbox and the learner's emails in Sent, newest first", () => {
		const boxes = buildMailboxes({
			opening: { emails: [{ from: "Maya Chen <maya@x.example>", to: "Learner", subject: "Dinner?", body: "Free Friday?", time: "Mon" }] },
			messages: [
				chat("1", "user", "To: Maya Chen <maya@x.example>\nSubject: Re: Dinner?\n\nYes!"),
				chat("2", "agent", "Subject: nope\n\nGreat, 7pm."),
			],
			counterpart,
			learnerName: "Learner",
		});

		expect(boxes.inbox.map((item) => [item.id, item.subject, item.body])).toEqual([
			["2", "Re: Dinner?", "Great, 7pm."],
			["opening-0", "Dinner?", "Free Friday?"],
		]);
		expect(boxes.sent).toMatchObject([
			{ id: "1", to: "Maya Chen <maya@x.example>", subject: "Re: Dinner?", body: "Yes!", from: { name: "Learner" } },
		]);
	});

	it("shows nothing for a reply that is still being written or failed", () => {
		const boxes = buildMailboxes({
			opening: {},
			messages: [chat("1", "user", "To: M\nSubject: Hi\n\nHello"), chat("retry-1", "agent", "", "pending")],
			counterpart,
			learnerName: "Learner",
		});

		expect(boxes.inbox).toEqual([]);
		expect(boxes.sent).toHaveLength(1);
	});
});
