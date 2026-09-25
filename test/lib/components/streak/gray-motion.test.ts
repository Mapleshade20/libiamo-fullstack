import { describe, expect, it } from "vitest";
import { grayDisplacement } from "$lib/components/streak/gray-motion";

describe("restrained, restless ash motion", () => {
	it("anchors the base, swings visibly both ways, and stays within a modest envelope", () => {
		const tip = Array.from({ length: 481 }, (_, i) => grayDisplacement(282, 320, i / 100, 1));
		expect(Math.min(...tip.map(([x]) => x))).toBeLessThan(-18);
		expect(Math.max(...tip.map(([x]) => x))).toBeGreaterThan(18);
		expect(tip.every(([x, y]) => Math.abs(x) <= 24 && Math.abs(y) <= 4)).toBe(true);
		for (let t = 0; t < 4.8; t += 0.1) expect(grayDisplacement(282, 540, t, 1).map(Math.abs)).toEqual([0, 0]);
	});
	it("rocks the belly and both shoulders, not just the tip", () => {
		expect(grayDisplacement(282, 460, 0.6, 1)[0]).toBeGreaterThan(5);
		expect(grayDisplacement(240, 460, 0.6, 1)[1]).toBeLessThan(0);
		expect(grayDisplacement(324, 460, 0.6, 1)[1]).toBeGreaterThan(0);
		const shifts = Array.from({ length: 480 }, (_, i) => grayDisplacement(282, 320, i / 100, 1)[0]);
		expect(shifts.reduce((a, b) => a + b, 0) / shifts.length).toBeCloseTo(0, 8);
	});
	it("closes the loop without a position/velocity jump and preserves the spring's exact neutral", () => {
		for (const time of [0, 0.8, 2.7, 4.8, 100]) expect(grayDisplacement(271, 321, time, 0).map(Math.abs)).toEqual([0, 0]);
		const x = (t: number) => grayDisplacement(271, 321, t, 1)[0];
		expect(x(4.8)).toBeCloseTo(x(0), 8);
		expect((x(4.8) - x(4.7999)) / 0.0001).toBeCloseTo((x(0.0001) - x(0)) / 0.0001, 2);
	});
});
