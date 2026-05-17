import { describe, expect, it } from "vitest";
import { formatVotes, getAvatarColor, seededInt } from "$lib/components/practice-ui/reddit/utils";

describe("reddit utils", () => {
	describe("getAvatarColor", () => {
		it("returns a consistent color for the same name", () => {
			const a = getAvatarColor("Alice");
			const b = getAvatarColor("Alice");
			expect(a).toBe(b);
		});

		it("returns different colors for different names", () => {
			const a = getAvatarColor("Alice");
			const b = getAvatarColor("Bob");
			expect(a).not.toBe(b);
		});

		it("returns a valid bg class string", () => {
			const result = getAvatarColor("TestUser");
			expect(result).toMatch(/^bg-\[#[0-9A-F]+\]$/);
		});

		it("handles empty string", () => {
			const result = getAvatarColor("");
			expect(result).toMatch(/^bg-\[#/);
		});
	});

	describe("formatVotes", () => {
		it("formats numbers under 10k as-is", () => {
			expect(formatVotes(42)).toBe("42");
			expect(formatVotes(0)).toBe("0");
			expect(formatVotes(9999)).toBe("9999");
		});

		it("formats 10k+ with k suffix", () => {
			expect(formatVotes(10000)).toBe("10.0k");
			expect(formatVotes(12345)).toBe("12.3k");
		});

		it("formats large numbers correctly", () => {
			expect(formatVotes(50000)).toBe("50.0k");
		});

		it("handles negative numbers", () => {
			expect(formatVotes(-42)).toBe("-42");
			expect(formatVotes(-10000)).toBe("-10.0k");
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

		it("can return the minimum value", () => {
			// Try many seeds to hit min boundary
			let foundMin = false;
			for (let i = 0; i < 200; i++) {
				if (seededInt(`seed-${i}`, 3, 3) === 3) foundMin = true;
			}
			expect(foundMin).toBe(true);
		});

		it("can return the maximum value", () => {
			let foundMax = false;
			for (let i = 0; i < 200; i++) {
				if (seededInt(`seed-${i}`, 7, 7) === 7) foundMax = true;
			}
			expect(foundMax).toBe(true);
		});
	});
});
