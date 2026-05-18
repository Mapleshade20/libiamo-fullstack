import type { SendAttemptResult } from "../chatFlowController";
import type { ChatMessage } from "../chatMessages";
import { ensureReplySubject, normalizeAgentSignature, normalizeReplySubject, parseAgentMailReply, parseDraftFromMessage } from "./mailUtils";
import type { NormalizedMailEmail } from "./types";
import type { MailContact } from "./userPool";

export function buildGeneratedInboxEmails({
	messages,
	agentMessages,
	recipient,
	userName,
	noSubjectLabel,
	tutorReplyLabel,
	fallbackTime,
}: {
	messages: ChatMessage[];
	agentMessages: ChatMessage[];
	recipient: MailContact;
	userName: string;
	noSubjectLabel: string;
	tutorReplyLabel: string;
	fallbackTime: string;
}): NormalizedMailEmail[] {
	return agentMessages.map((message, index) => {
		const previousUserMessage = [...messages]
			.slice(
				0,
				messages.findIndex((candidate) => candidate.id === message.id),
			)
			.reverse()
			.find((candidate) => candidate.role === "user" && !candidate.isHidden);
		const previousDraft = previousUserMessage ? parseDraftFromMessage(previousUserMessage.text, noSubjectLabel) : null;
		const parsedReply = parseAgentMailReply(message.text, previousDraft?.subject || noSubjectLabel);
		const subject = normalizeReplySubject(parsedReply.subject, noSubjectLabel);
		const body = normalizeAgentSignature(parsedReply.body, recipient.name);
		const fromName = !message.authorName || message.authorName === tutorReplyLabel ? recipient.name : message.authorName;
		const fromAddress = recipient.email;
		const displaySubject = previousDraft && !parsedReply.hasExplicitSubject ? ensureReplySubject(subject, noSubjectLabel) : subject;

		return {
			id: `agent-${message.id || index}`,
			from: `${fromName} <${fromAddress}>`,
			to: userName,
			subject: displaySubject,
			body,
			time: message.timestamp || fallbackTime,
			fromName,
			fromAddress,
			displayFrom: `${fromName} <${fromAddress}>`,
			preview: body,
			deliveryState: message.deliveryState,
			clientMessageId: message.clientMessageId,
			retryText: message.retryText,
			messageId: message.id,
		};
	});
}

export function buildAgentMessageFromSendResult({
	result,
	clientMessageId,
	retryText,
	recipient,
	timestamp,
	stillProcessingMessage,
	retryFailedMessage,
	id = crypto.randomUUID(),
}: {
	result: SendAttemptResult;
	clientMessageId: string;
	retryText: string;
	recipient: MailContact;
	timestamp: string;
	stillProcessingMessage: string;
	retryFailedMessage: string;
	id?: string;
}): ChatMessage | null {
	if (result.status === "reply") {
		if (!result.text.trim()) return null;
		return {
			id,
			role: "agent",
			text: result.text,
			timestamp,
			authorName: recipient.name,
			avatarColor: "bg-[#3478F6]",
			deliveryState: "sent",
			clientMessageId,
		};
	}

	if (result.status === "pending") {
		return {
			id,
			role: "agent",
			text: stillProcessingMessage,
			timestamp,
			authorName: recipient.name,
			avatarColor: "bg-[#3478F6]",
			deliveryState: "pending",
			clientMessageId,
			retryText,
		};
	}

	if (result.status === "failed") {
		return {
			id,
			role: "agent",
			text: retryFailedMessage,
			timestamp,
			authorName: recipient.name,
			avatarColor: "bg-[#3478F6]",
			deliveryState: "failed",
			clientMessageId,
			retryText,
		};
	}

	return null;
}
