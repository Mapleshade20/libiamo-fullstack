import { describe, expect, it } from "vitest";
import type { ChatMessage } from "$lib/components/practice-ui/chatMessages";
import { buildAgentMessageFromSendResult, buildGeneratedInboxEmails } from "$lib/components/practice-ui/mail/presentation";

describe("mail presentation", () => {
	const recipient = {
		name: "Maya Chen",
		email: "maya@example.com",
		display: "Maya Chen <maya@example.com>",
	};

	function buildMessages(agentText: string): ChatMessage[] {
		return [
			{
				id: "u1",
				role: "user",
				text: "To: Maya\nSubject: Project update\n\nHello Maya",
				timestamp: "9:00",
				authorName: "Learner",
			},
			{
				id: "a1",
				role: "agent",
				text: agentText,
				timestamp: "9:01",
				authorName: "Tutor response",
				clientMessageId: "mail-1",
			},
		];
	}

	it("uses a single reply prefix when agent does not provide a new subject", () => {
		const messages = buildMessages("Thanks for the update.");
		const agentMessage = messages[1];
		expect(agentMessage).toBeDefined();

		expect(
			buildGeneratedInboxEmails({
				messages,
				agentMessages: agentMessage ? [agentMessage] : [],
				recipient,
				userName: "Learner",
				noSubjectLabel: "(No Subject)",
				tutorReplyLabel: "Tutor response",
				fallbackTime: "Today",
			})[0],
		).toMatchObject({
			subject: "Re: Project update",
			body: "Thanks for the update.",
			fromName: "Maya Chen",
		});
	});

	it("respects explicit agent subject changes and cleans repeated reply prefixes", () => {
		const messages = buildMessages("Subject: Re: Re: New timeline\n\nCould Friday work?");
		const agentMessage = messages[1];
		expect(agentMessage).toBeDefined();

		expect(
			buildGeneratedInboxEmails({
				messages,
				agentMessages: agentMessage ? [agentMessage] : [],
				recipient,
				userName: "Learner",
				noSubjectLabel: "(No Subject)",
				tutorReplyLabel: "Tutor response",
				fallbackTime: "Today",
			})[0]?.subject,
		).toBe("Re: New timeline");
	});

	it("uses the recipient display without an empty angle address", () => {
		const messages = buildMessages("Thanks for the update.");
		const agentMessage = messages[1];
		expect(agentMessage).toBeDefined();

		expect(
			buildGeneratedInboxEmails({
				messages,
				agentMessages: agentMessage ? [agentMessage] : [],
				recipient: { name: "Maya Chen", email: "", display: "Maya Chen" },
				userName: "Learner",
				noSubjectLabel: "(No Subject)",
				tutorReplyLabel: "Tutor response",
				fallbackTime: "Today",
			})[0],
		).toMatchObject({
			from: "Maya Chen",
			displayFrom: "Maya Chen",
			fromAddress: "",
		});
	});

	it("builds agent messages for send result states", () => {
		expect(
			buildAgentMessageFromSendResult({
				result: { status: "reply", text: "Thanks", terminated: false },
				clientMessageId: "mail-1",
				retryText: "Original",
				recipient,
				timestamp: "9:02",
				stillProcessingMessage: "Still processing",
				retryFailedMessage: "Failed",
				id: "agent-1",
			}),
		).toMatchObject({
			id: "agent-1",
			role: "agent",
			text: "Thanks",
			deliveryState: "sent",
			clientMessageId: "mail-1",
		});

		expect(
			buildAgentMessageFromSendResult({
				result: { status: "failed" },
				clientMessageId: "mail-1",
				retryText: "Original",
				recipient,
				timestamp: "9:02",
				stillProcessingMessage: "Still processing",
				retryFailedMessage: "Failed",
				id: "agent-2",
			}),
		).toMatchObject({
			text: "Failed",
			deliveryState: "failed",
			retryText: "Original",
		});
	});

	it("does not build a message for rejected or blank replies", () => {
		expect(
			buildAgentMessageFromSendResult({
				result: { status: "rejected" },
				clientMessageId: "mail-1",
				retryText: "Original",
				recipient,
				timestamp: "9:02",
				stillProcessingMessage: "Still processing",
				retryFailedMessage: "Failed",
			}),
		).toBeNull();

		expect(
			buildAgentMessageFromSendResult({
				result: { status: "reply", text: "   ", terminated: false },
				clientMessageId: "mail-1",
				retryText: "Original",
				recipient,
				timestamp: "9:02",
				stillProcessingMessage: "Still processing",
				retryFailedMessage: "Failed",
			}),
		).toBeNull();
	});
});
