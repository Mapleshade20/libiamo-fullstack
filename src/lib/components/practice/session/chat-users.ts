/** Who takes part in a simulated chat: the agent and a seeded, stable crowd of bystanders. */

export type ChatUser = {
	id: string;
	name: string;
	status: string;
	color: string;
	isAgent: boolean;
};

export type ChatOpeningState = {
	serverName?: string;
	channelName?: string;
	previousMessages?: Array<{
		sender?: string;
		author?: string;
		text?: string;
		content?: string;
	}>;
};

export const USER_POOL = [
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

export const STATUS_POOL = [
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

export const COLOR_POOL = [
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

export function createSeededRandom(seed: number) {
	let state = seed ? seed * 1234567 : 1234567;
	return () => {
		state = (state * 9301 + 49297) % 233280;
		return state / 233280;
	};
}

export function shuffleArray<T>(array: T[], randomFunc: () => number): T[] {
	const arr = [...array];
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(randomFunc() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

export function initUserPool(seedId: number) {
	const random = createSeededRandom(seedId);
	const shuffledNames = shuffleArray(USER_POOL, random);

	const agentUser: ChatUser = {
		id: "agent",
		name: shuffledNames.pop() || "Agent",
		status: STATUS_POOL[Math.floor(random() * STATUS_POOL.length)],
		color: COLOR_POOL[Math.floor(random() * COLOR_POOL.length)],
		isAgent: true,
	};

	const numOnline = Math.floor(random() * 3) + 1;
	const numOffline = Math.floor(random() * 4) + 2;

	const onlineUsers: ChatUser[] = [];
	for (let i = 0; i < numOnline; i++) {
		onlineUsers.push({
			id: `online_${i}`,
			name: shuffledNames.pop() || `User_${i}`,
			status: STATUS_POOL[Math.floor(random() * STATUS_POOL.length)],
			color: COLOR_POOL[Math.floor(random() * COLOR_POOL.length)],
			isAgent: false,
		});
	}

	const offlineUsers: ChatUser[] = [];
	for (let i = 0; i < numOffline; i++) {
		offlineUsers.push({
			id: `offline_${i}`,
			name: shuffledNames.pop() || `Offline_${i}`,
			status: "Offline",
			color: COLOR_POOL[Math.floor(random() * COLOR_POOL.length)],
			isAgent: false,
		});
	}

	return { agentUser, onlineUsers, offlineUsers };
}
