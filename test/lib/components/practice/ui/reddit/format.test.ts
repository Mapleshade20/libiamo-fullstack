import { describe, expect, it } from "vitest";
import { getAvatarColor, seededInt } from "$lib/components/practice/ui/reddit/format";

describe("reddit format", () => {
	describe("getAvatarColor", () => {
		it("returns a consistent color for the same name", () => {
			const a = getAvatarColor("Alice");
			const b = getAvatarColor("Alice");
			expect(a).toBe(b);
		});
	});

	describe("seededInt", () => {
		it("returns a number within the specified range", () => {
			for (let i = 0; i < 50; i++) {
				const result = seededInt(`seed-${i}`, 5, 10);
				expect(result).toBeGreaterThanOrEqual(5);
				expect(result).toBeLessThanOrEqual(10);
			}
		});

		it("returns the same value for the same seed", () => {
			const a = seededInt("consistent", 1, 100);
			const b = seededInt("consistent", 1, 100);
			expect(a).toBe(b);
		});

		it("returns the only value in a singleton range", () => {
			expect(seededInt("seed", 3, 3)).toBe(3);
		});
	});
});
