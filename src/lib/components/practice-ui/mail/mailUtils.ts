import { normalizeText } from "../../utils/messageUtils";
import type { DraftEmail } from "./types";

export function formatDraftMessage(value: DraftEmail, noSubjectLabel: string) {
	const subject = normalizeText(value.subject, noSubjectLabel);
	return `To: ${value.to.trim()}\nSubject: ${subject}\n\n${value.body.trim()}`;
}

export function parseDraftFromMessage(text: string, noSubjectLabel: string): DraftEmail {
	const toMatch = text.match(/^To:\s*(.*)$/m);
	const subjectMatch = text.match(/^Subject:\s*(.*)$/m);
	const body = text.replace(/^To:[^\n]*\nSubject:[^\n]*\n\n?/, "").trim();
	return {
		to: toMatch?.[1]?.trim() ?? "",
		subject: subjectMatch?.[1]?.trim() ?? noSubjectLabel,
		body,
	};
}
