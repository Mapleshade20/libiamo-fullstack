import type { MailEmail } from "./types";

export type MailContact = {
	name: string;
	email: string;
	display: string;
};

const CONTACTS = [
	["Maya Chen", "maya.chen@northstar.example"],
	["Daniel Brooks", "daniel.brooks@harbor.example"],
	["Sofia Rivera", "sofia.rivera@lumen.example"],
	["Ethan Park", "ethan.park@atlas.example"],
	["Amara Singh", "amara.singh@cedar.example"],
	["Lucas Meyer", "lucas.meyer@brightline.example"],
	["Nina Alvarez", "nina.alvarez@evergreen.example"],
	["Claire Dubois", "claire.dubois@meridian.example"],
] as const;

function hashSeed(seed: string) {
	let hash = 0;
	for (let index = 0; index < seed.length; index += 1) {
		hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
	}
	return hash;
}

export function getMailContact(seed: string | number): MailContact {
	const [name, email] = CONTACTS[hashSeed(String(seed || "mail")) % CONTACTS.length];
	return {
		name,
		email,
		display: `${name} <${email}>`,
	};
}

function stripWrappingQuotes(value: string) {
	return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).trim() : value;
}

function formatMailContact(name: string, email: string) {
	if (email && name && name !== email) return `${name} <${email}>`;
	return name || email;
}

function parseMailContact(value: string): MailContact | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (!trimmed.endsWith(">")) {
		return {
			name: trimmed,
			email: trimmed.includes("@") ? trimmed : "",
			display: trimmed,
		};
	}

	const angleStart = trimmed.lastIndexOf("<");
	if (angleStart === -1) {
		return {
			name: trimmed,
			email: trimmed.includes("@") ? trimmed : "",
			display: trimmed,
		};
	}

	const email = trimmed.slice(angleStart + 1, -1).trim();
	const rawName = trimmed.slice(0, angleStart).trim();
	const name = stripWrappingQuotes(rawName) || email;
	return {
		name,
		email,
		display: formatMailContact(name, email),
	};
}

export function getMailContactFromOpeningEmails(emails: MailEmail[] | undefined, fallback: MailContact): MailContact {
	const sender = (Array.isArray(emails) ? emails : []).find((email) => email.from?.trim())?.from;
	if (!sender) return fallback;
	return parseMailContact(sender) ?? fallback;
}
