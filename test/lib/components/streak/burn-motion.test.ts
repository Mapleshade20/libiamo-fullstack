import { describe, expect, it } from "vitest";
import { burnPose } from "$lib/components/streak/burn-motion";

// Deliberately nonmatching endpoints and a dead old bridge expose an accidental wrap/hold.
const frames = Array.from({ length: 82 }, (_, i) => [[i < 64 ? i : 999, Math.sin(i / 7) * 10]]);
const x = (t: number) => burnPose(frames, t)[0][0];

describe("burning loop overlap", () => {
	it("preserves ignition entry and the recorded flutter outside the overlap", () => {
		expect(burnPose(frames, 0)).toEqual(frames[0]);
		expect(burnPose(frames, 16)).toEqual(frames[16]);
		expect(x(31.25)).toBeCloseTo(31.25);
	});
	it("joins with matching position and nonzero velocity, never sampling the dead return bridge", () => {
		const epsilon = 0.0001;
		for (const seam of [64, 116, 168]) {
			expect(x(seam)).toBe(12);
			expect(x(seam - epsilon)).toBeCloseTo(12 - epsilon, 6);
			expect((x(seam) - x(seam - epsilon)) / epsilon).toBeCloseTo((x(seam + epsilon) - x(seam)) / epsilon, 4);
			expect((x(seam + epsilon) - x(seam)) / epsilon).toBeCloseTo(1, 4);
		}
		for (let t = 0; t < 200; t += 0.25) expect(x(t)).toBeLessThan(64);
	});
	it("repeats the full moving pose without a restart pause", () => {
		for (const t of [12, 23.8, 51.9, 57.3, 63.99]) {
			const a = burnPose(frames, t).flat();
			const b = burnPose(frames, t + 52).flat();
			for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 8);
		}
	});
});
