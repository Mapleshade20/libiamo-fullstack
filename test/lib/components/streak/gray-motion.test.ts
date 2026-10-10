import { describe, expect, it } from "vitest";
import { grayDisplacement } from "$lib/components/streak/gray-motion";

describe("restrained, restless ash motion", () => {
	it("anchors the base throughout the loop", () => {
		for (let t = 0; t < 4.8; t += 0.1) expect(grayDisplacement(282, 540, t, 1).map(Math.abs)).toEqual([0, 0]);
	});
	it("closes the loop without a position/velocity jump and preserves the spring's exact neutral", () => {
		for (const time of [0, 0.8, 2.7, 4.8, 100]) expect(grayDisplacement(271, 321, time, 0).map(Math.abs)).toEqual([0, 0]);
		const x = (t: number) => grayDisplacement(271, 321, t, 1)[0];
		expect(x(4.8)).toBeCloseTo(x(0), 8);
		expect((x(4.8) - x(4.7999)) / 0.0001).toBeCloseTo((x(0.0001) - x(0)) / 0.0001, 2);
	});
});
