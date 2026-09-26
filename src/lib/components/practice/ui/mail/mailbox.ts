import { type MailContact, type MailOpeningState, parseMailAddress, parseMailMessage, replySubject, stripMailHeaders } from "$lib/practice/mail";
import type { ChatMessage } from "$lib/practice/messages";

export type Mailbox = "inbox" | "sent";

export type MailItem = {
	id: string;
	mailbox: Mailbox;
	from: MailContact;
	to: string;
	subject: string;
	body: string;
	/** Display time; empty for authored emails without one. */
	time: string;
};

/**
 * The two mailboxes, newest first. Authored opening emails and delivered replies arrive in the
 * inbox; the learner's emails are in Sent. A reply takes the subject of the email it answers.
 * Pending replies are not mail yet, so they appear nowhere.
 */
export function buildMailboxes(input: {
	opening: MailOpeningState;
	messages: ChatMessage[];
	counterpart: MailContact;
	learnerName: string;
}): Record<Mailbox, MailItem[]> {
	const inbox: MailItem[] = (input.opening.emails ?? []).map((email, index) => ({
		id: `opening-${index}`,
		mailbox: "inbox",
		from: parseMailAddress(email.from ?? ""),
		to: email.to?.trim() ?? "",
		subject: email.subject?.trim() ?? "",
		body: email.body?.trim() ?? "",
		time: email.time?.trim() ?? "",
	}));
	const sent: MailItem[] = [];
	let lastSubject = inbox.at(-1)?.subject ?? "";

	for (const message of input.messages) {
		if (message.deliveryState) continue;
		if (message.role === "user") {
			const draft = parseMailMessage(message.text);
			lastSubject = draft.subject;
			sent.push({
				id: message.id,
				mailbox: "sent",
				from: { name: input.learnerName, address: "" },
				to: draft.to,
				subject: draft.subject,
				body: draft.body,
				time: message.timestamp,
			});
		} else {
			inbox.push({
				id: message.id,
				mailbox: "inbox",
				from: input.counterpart,
				to: input.learnerName,
				subject: replySubject(lastSubject),
				body: stripMailHeaders(message.text),
				time: message.timestamp,
			});
		}
	}

	return { inbox: inbox.reverse(), sent: sent.reverse() };
}
