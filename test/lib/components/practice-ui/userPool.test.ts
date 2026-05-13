import { describe, expect, it } from "vitest";
import { COLOR_POOL, STATUS_POOL } from "$lib/components/practice-ui/discord/mockData";
import { createSeededRandom, initUserPool, shuffleArray } from "$lib/components/practice-ui/discord/userPool";

describe("userPool", () => {
	describe("initUserPool", () => {
		it("builds deterministic roster for same seed and preserves ranges", () => {
			const seed = 1001;
			const poolA = initUserPool(seed);
			const poolB = initUserPool(seed);

			expect(poolA).toEqual(poolB);
			expect(poolA.onlineUsers.length).toBeGreaterThanOrEqual(1);
			expect(poolA.onlineUsers.length).toBeLessThanOrEqual(3);
			expect(poolA.offlineUsers.length).toBeGreaterThanOrEqual(2);
			expect(poolA.offlineUsers.length).toBeLessThanOrEqual(5);
		});

		it("assigns required identities and valid status/color values", () => {
			const pool = initUserPool(33333);
			const allUsers = [pool.agentUser, ...pool.onlineUsers, ...pool.offlineUsers];

			expect(pool.agentUser).toMatchObject({
				id: "agent",
				isAgent: true,
			});

			pool.onlineUsers.forEach((user, idx) => {
				expect(user.id).toBe(`online_${idx}`);
				expect(user.isAgent).toBe(false);
				expect(STATUS_POOL).toContain(user.status);
				expect(COLOR_POOL).toContain(user.color);
			});

			pool.offlineUsers.forEach((user, idx) => {
				expect(user.id).toBe(`offline_${idx}`);
				expect(user.status).toBe("Offline");
				expect(user.isAgent).toBe(false);
				expect(COLOR_POOL).toContain(user.color);
			});

			for (const user of allUsers) {
				expect(user.name.length).toBeGreaterThan(0);
			}

			const uniqueNames = new Set(allUsers.map((u) => u.name));
			expect(uniqueNames.size).toBe(allUsers.length);
		});
	});

	describe("createSeededRandom", () => {
		it("generates deterministic random sequences for same seed", () => {
			const random1 = createSeededRandom(12345);
			const random2 = createSeededRandom(12345);

			const sequence1 = Array.from({ length: 10 }, () => random1());
			const sequence2 = Array.from({ length: 10 }, () => random2());

			expect(sequence1).toEqual(sequence2);
		});

		it("generates different sequences for different seeds", () => {
			const random1 = createSeededRandom(12345);
			const random2 = createSeededRandom(54321);

			const sequence1 = Array.from({ length: 10 }, () => random1());
			const sequence2 = Array.from({ length: 10 }, () => random2());

			expect(sequence1).not.toEqual(sequence2);
		});

		it.each([0, 1, 99999])("returns value in [0,1) for seed %s", (seed) => {
			const random = createSeededRandom(seed);
			const value = random();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		});
	});

	describe("shuffleArray", () => {
		it("shuffles array deterministically based on random function", () => {
			const random1 = createSeededRandom(111);
			const random2 = createSeededRandom(111);

			const input = [1, 2, 3, 4, 5];
			const shuffled1 = shuffleArray(input, random1);
			const shuffled2 = shuffleArray(input, random2);

			expect(shuffled1).toEqual(shuffled2);
		});

		it("returns a non-mutating permutation with same length", () => {
			const random = createSeededRandom(444);
			const input = [1, 2, 3, 4, 5];
			const copyBefore = [...input];

			const shuffled = shuffleArray(input, random);

			expect(input).toEqual(copyBefore);
			expect(shuffled).toHaveLength(input.length);
			expect([...shuffled].sort()).toEqual([...input].sort());
		});

		it.each([
			{ input: [] as number[], expected: [] as number[] },
			{ input: [42], expected: [42] },
		])("handles boundary array input %#", ({ input, expected }) => {
			const random = createSeededRandom(666);
			expect(shuffleArray(input, random)).toEqual(expected);
		});
	});
});
