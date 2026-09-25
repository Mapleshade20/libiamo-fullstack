type Pose = number[][];

const smooth = (t: number) => t * t * t * (10 + t * (-15 + 6 * t));

/** Overlap two moving ends instead of braking through the old eased return bridge. */
export function burnPose(frames: Pose[], frame: number): Pose {
	const overlap = 12;
	const end = 64;
	const period = end - overlap;
	// Preserve the ignition's first pose on entry, then follow the closed moving loop.
	const time = frame < overlap ? Math.max(0, frame) : overlap + ((frame - overlap) % period);
	const sample = (at: number, layer: number, coordinate: number) => {
		const index = Math.floor(at);
		const t = at - index;
		const get = (offset: number) => frames[Math.max(0, Math.min(end - 1, index + offset))][layer][coordinate];
		const [a, b, c, d] = [-1, 0, 1, 2].map(get);
		return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3);
	};
	const blend = smooth(Math.max(0, (time - period) / overlap));
	return frames[0].map((layer, i) =>
		layer.map((_, j) => {
			const a = sample(time, i, j);
			return blend ? a + (sample(time - period, i, j) - a) * blend : a;
		}),
	);
}
