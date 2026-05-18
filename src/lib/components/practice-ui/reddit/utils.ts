export const AVATAR_COLORS = [
	"bg-[#FF4500]",
	"bg-[#0079D3]",
	"bg-[#46D160]",
	"bg-[#FF585B]",
	"bg-[#7193FF]",
	"bg-[#FFB000]",
	"bg-[#25B79F]",
	"bg-[#DB0064]",
	"bg-[#8B5CF6]",
	"bg-[#F59E0B]",
];

export function getAvatarColor(name: string): string {
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
	return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function formatVotes(n: number): string {
	if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1)}k`;
	return String(n);
}

export function seededInt(seed: string, min: number, max: number): number {
	let h = 5381;
	for (let i = 0; i < seed.length; i++) h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0;
	return min + (h % (max - min + 1));
}
