/**
 * The mail surface's wire format. A learner email is stored as plain text with a `To:`/`Subject:`
 * header; the agent prompt, the send validation and the interface all read it through here.
 */

export type MailDraft = {
	to: string;
	subject: string;
	body: string;
};

export type MailContact = {
	name: string;
	address: string;
};

export type MailOpeningEmail = {
	from?: string;
	to?: string;
	subject?: string;
	body?: string;
	time?: string;
};

export type MailOpeningState = {
	emails?: MailOpeningEmail[];
};

/** Trims trailing spaces and collapses runs of blank lines to one. */
export function normalizeMailBody(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/, "").replace(/^[ \t]+/, ""))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function formatMailMessage(draft: MailDraft): string {
	return `To: ${draft.to.trim()}\nSubject: ${draft.subject.trim()}\n\n${normalizeMailBody(draft.body)}`;
}

export function parseMailMessage(content: string): MailDraft {
	const lines = content.replace(/\r\n?/g, "\n").split("\n");
	if (!lines[0]?.startsWith("To:") || !lines[1]?.startsWith("Subject:")) return { to: "", subject: "", body: content.trim() };
	return {
		to: lines[0].slice(3).trim(),
		subject: lines[1].slice(8).trim(),
		body: lines
			.slice(lines[2] === "" ? 3 : 2)
			.join("\n")
			.trim(),
	};
}

/** Agent replies are bodies only; a model that still writes header lines has them dropped. */
export function stripMailHeaders(text: string): string {
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	let start = 0;
	while (start < lines.length && (/^(subject|from|to|cc|bcc|date)\s*:/i.test(lines[start].trim()) || lines[start].trim() === "")) start += 1;
	return lines.slice(start).join("\n").trim() || text.trim();
}

export function replySubject(subject: string): string {
	const base = subject.replace(/^(\s*re:\s*)+/i, "").trim();
	return base ? `Re: ${base}` : "";
}

/** `Maya Chen <maya@x.example>` → name and address; a bare value is both. */
export function parseMailAddress(value: string): MailContact {
	const trimmed = value.trim();
	const match = trimmed.match(/^(.*)<([^<>]+)>$/);
	if (!match) return { name: trimmed, address: trimmed.includes("@") ? trimmed : "" };
	const address = match[2].trim();
	const name = match[1]
		.trim()
		.replace(/^"(.*)"$/, "$1")
		.trim();
	return { name: name || address, address };
}

export function formatMailAddress(contact: MailContact): string {
	return contact.address && contact.name !== contact.address ? `${contact.name} <${contact.address}>` : contact.name || contact.address;
}

const CONTACTS: MailContact[] = [
	{ name: "Maya Chen", address: "maya.chen@northstar.example" },
	{ name: "Daniel Brooks", address: "daniel.brooks@harbor.example" },
	{ name: "Sofia Rivera", address: "sofia.rivera@lumen.example" },
	{ name: "Ethan Park", address: "ethan.park@atlas.example" },
	{ name: "Amara Singh", address: "amara.singh@cedar.example" },
	{ name: "Lucas Meyer", address: "lucas.meyer@brightline.example" },
	{ name: "Nina Alvarez", address: "nina.alvarez@evergreen.example" },
	{ name: "Claire Dubois", address: "claire.dubois@meridian.example" },
];

/** A stable made-up person for surfaces whose task authored no counterpart name. */
export function seededContact(seed: string | number): MailContact {
	let hash = 0;
	for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return CONTACTS[hash % CONTACTS.length];
}

/** The person the learner writes to: the first opening email's sender. */
export function resolveMailCounterpart(openingState: MailOpeningState, seed: string | number): MailContact {
	const sender = openingState.emails?.find((email) => email.from?.trim())?.from;
	return sender ? parseMailAddress(sender) : seededContact(seed);
}
