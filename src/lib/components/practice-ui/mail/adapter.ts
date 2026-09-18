import type { PracticePresentationAdapter } from "../types";
import { getMailBodyHtmlFromMessage, sanitizeDraftBodyHtml } from "./mailUtils";
import type { MailOpeningState } from "./types";
import { getMailContact, getMailContactFromOpeningEmails, type MailContact } from "./userPool";

export function createMailPresentationAdapter(
	getTaskId: () => string,
	getUserName: () => string,
): PracticePresentationAdapter<MailOpeningState, { recipient: MailContact }> {
	const resolveRecipient = (openingState: MailOpeningState, sessionId: number | null) =>
		getMailContactFromOpeningEmails(openingState.emails, getMailContact(getTaskId() || sessionId || getUserName()));

	return {
		normalizeOpeningState: (value) => (value && typeof value === "object" ? (value as MailOpeningState) : {}),
		resolvePresentation: ({ sessionId, openingState }) => {
			const recipient = resolveRecipient(openingState, sessionId);
			return { agent: { name: recipient.name }, context: { recipient } };
		},
		buildOpeningMessages: () => [],
		retryFields: (message): Record<string, string> => {
			const bodyHtml = message ? sanitizeDraftBodyHtml(getMailBodyHtmlFromMessage(message)) : "";
			if (!bodyHtml) return {};
			return { bodyHtml };
		},
		beforeFeedbackNavigation: () => {
			if (typeof localStorage !== "undefined") localStorage.removeItem(`mail-draft:${getTaskId() || "current"}`);
		},
	};
}
