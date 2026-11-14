/** The simulated server's crowd: a stable, seeded set of bystanders around the counterpart. */

export type DiscordMember = {
	name: string;
	status: string;
};

const NAMES = [
	"ShadowHunter",
	"PixelDust",
	"Luna_Star",
	"CyberPunk",
	"NeonViper",
	"GamerPro99",
	"JazzCat",
	"SilentWolf",
	"Nova",
	"Zephyr",
	"Aether",
	"FrostByte",
	"Ironclad",
	"GhostRecon",
	"MysticMage",
	"QuantumLeap",
];

const STATUSES = [
	"Playing Valorant",
	"Listening to Spotify",
	"Coding",
	"AFK",
	"Do Not Disturb",
	"Touching grass",
	"Browsing Reddit",
	"Looking for Group",
	"In a meeting",
	"Watching YouTube",
	"Studying",
	"Grinding ranked",
];

const COLORS = [
	"bg-red-500",
	"bg-blue-500",
	"bg-green-500",
	"bg-yellow-500",
	"bg-purple-500",
	"bg-pink-500",
	"bg-indigo-500",
	"bg-teal-500",
	"bg-orange-500",
];

function seededRandom(seed: number) {
	let state = seed ? seed * 1234567 : 1234567;
	return () => {
		state = (state * 9301 + 49297) % 233280;
		return state / 233280;
	};
}

function hash(value: string) {
	let result = 0;
	for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
	return result;
}

/** A member's avatar colour, derived from the name so every view of them agrees. */
export function memberColor(name: string): string {
	return COLORS[hash(name) % COLORS.length];
}

/** The counterpart's fallback identity and the bystanders, stable for one task. */
export function createMemberPool(seed: string) {
	const random = seededRandom(hash(seed));
	const names = [...NAMES];
	for (let index = names.length - 1; index > 0; index -= 1) {
		const other = Math.floor(random() * (index + 1));
		[names[index], names[other]] = [names[other], names[index]];
	}
	const status = () => STATUSES[Math.floor(random() * STATUSES.length)];
	const agent: DiscordMember = { name: names.pop() ?? "Agent", status: status() };
	const online = Array.from({ length: Math.floor(random() * 3) + 1 }, (_, index) => ({ name: names.pop() ?? `User_${index}`, status: status() }));
	const offline = Array.from({ length: Math.floor(random() * 4) + 2 }, (_, index) => ({
		name: names.pop() ?? `Offline_${index}`,
		status: "Offline",
	}));
	return { agent, online, offline };
}
