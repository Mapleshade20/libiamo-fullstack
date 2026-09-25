/** Rock the whole silhouette about its foot; a smaller harmonic adds a restrained recoil. */
export function grayDisplacement(x: number, y: number, seconds: number, amount: number): [number, number] {
	const phase = (seconds / 4.8) * Math.PI * 2;
	const angle = 0.09 * Math.sin(phase) + 0.018 * Math.sin(3 * phase);
	const height = Math.max(0, Math.min(1, (540 - y) / 220));
	const dx = (x - 282) * (Math.cos(angle) - 1) + (540 - y) * Math.sin(angle) + 2 * Math.sin(2 * phase) * height ** 2;
	const dy = (x - 282) * Math.sin(angle) + (y - 540) * (Math.cos(angle) - 1);
	return [dx * amount, dy * amount];
}
