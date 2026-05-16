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
