export function stableChoice(seed: string, choices: readonly string[]): string {
	let hash = 2166136261;
	for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
	return choices[Math.abs(hash) % choices.length] ?? choices[0] ?? "User";
}
