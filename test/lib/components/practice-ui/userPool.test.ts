import { describe, expect, it } from "vitest";
import { COLOR_POOL, STATUS_POOL } from "$lib/components/practice-ui/discord/mockData";
import { createSeededRandom, initUserPool, shuffleArray } from "$lib/components/practice-ui/discord/userPool";

describe("userPool", () => {
	describe("initUserPool", () => {
		it("initializes deterministic user pool based on session ID", () => {
			const pool1 = initUserPool(1001);
			const pool2 = initUserPool(1001);
			const pool3 = initUserPool(9999);

			expect(pool1.agentUser.name).toEqual(pool2.agentUser.name);
			expect(pool1.onlineUsers.length).toBeGreaterThan(0);

			expect(pool1.agentUser.name).not.toEqual(pool3.agentUser.name);
		});

		it("creates agent user with required properties", () => {
			const pool = initUserPool(12345);

			expect(pool.agentUser).toMatchObject({
				id: "agent",
				isAgent: true,
			});

			expect(typeof pool.agentUser.name).toBe("string");
			expect(typeof pool.agentUser.status).toBe("string");
			expect(typeof pool.agentUser.color).toBe("string");
			expect(pool.agentUser.name.length).toBeGreaterThan(0);
		});

		it("generates online users within expected range", () => {
			const pool = initUserPool(11111);

			expect(pool.onlineUsers.length).toBeGreaterThanOrEqual(1);
			expect(pool.onlineUsers.length).toBeLessThanOrEqual(3);
		});

		it("generates offline users within expected range", () => {
			const pool = initUserPool(22222);

			expect(pool.offlineUsers.length).toBeGreaterThanOrEqual(2);
			expect(pool.offlineUsers.length).toBeLessThanOrEqual(6);
		});

		it("ensures all online users have required properties", () => {
			const pool = initUserPool(33333);

			pool.onlineUsers.forEach((user) => {
				expect(user).toMatchObject({
					id: expect.stringMatching(/^online_\d+$/),
					isAgent: false,
				});
				expect(typeof user.name).toBe("string");
				expect(typeof user.status).toBe("string");
				expect(typeof user.color).toBe("string");
				expect(STATUS_POOL).toContain(user.status);
				expect(COLOR_POOL).toContain(user.color);
			});
		});

		it("ensures all offline users have required properties", () => {
			const pool = initUserPool(44444);

			pool.offlineUsers.forEach((user) => {
				expect(user).toMatchObject({
					id: expect.stringMatching(/^offline_\d+$/),
					isAgent: false,
					status: "Offline",
				});
				expect(typeof user.name).toBe("string");
				expect(typeof user.color).toBe("string");
				expect(COLOR_POOL).toContain(user.color);
			});
		});

		it("ensures all users have unique names", () => {
			const pool = initUserPool(55555);
			const allNames = [pool.agentUser.name, ...pool.onlineUsers.map((u) => u.name), ...pool.offlineUsers.map((u) => u.name)];

			const uniqueNames = new Set(allNames);
			expect(uniqueNames.size).toBe(allNames.length);
		});

		it("produces distinct agent names across different seeds", () => {
			const pools = Array.from({ length: 10 }, (_, i) => initUserPool(10000 + i));
			const uniqueNames = new Set(pools.map((p) => p.agentUser.name));
			expect(uniqueNames.size).toBeGreaterThanOrEqual(8);
		});

		it("creates default user names when pool is exhausted", () => {
			// Create many pools to exhaust the user pool
			const pools = Array.from({ length: 20 }, (_, i) => initUserPool(i));

			pools.forEach((pool) => {
				const allUsers = [pool.agentUser, ...pool.onlineUsers, ...pool.offlineUsers];
				allUsers.forEach((user) => {
					expect(user.name).toBeDefined();
					expect(user.name.length).toBeGreaterThan(0);
				});
			});
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

		it("returns values between 0 and 1", () => {
			const random = createSeededRandom(99999);

			for (let i = 0; i < 100; i++) {
				const value = random();
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThan(1);
			}
		});

		it("produces different values on consecutive calls", () => {
			const random = createSeededRandom(77777);

			const values = Array.from({ length: 20 }, () => random());
			const uniqueValues = new Set(values);

			// Should generate mostly different values
			expect(uniqueValues.size).toBeGreaterThan(15);
		});

		it("handles zero seed", () => {
			const random = createSeededRandom(0);

			expect(() => random()).not.toThrow();
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

		it("does not modify original array", () => {
			const random = createSeededRandom(222);
			const input = [1, 2, 3, 4, 5];

			shuffleArray(input, random);

			expect(input).toEqual([1, 2, 3, 4, 5]);
		});

		it("returns array with same length", () => {
			const random = createSeededRandom(333);
			const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

			const shuffled = shuffleArray(input, random);

			expect(shuffled).toHaveLength(input.length);
		});

		it("returns array with same elements", () => {
			const random = createSeededRandom(444);
			const input = [1, 2, 3, 4, 5];

			const shuffled = shuffleArray(input, random);

			expect(shuffled.sort()).toEqual(input.sort());
		});

		it("handles empty array", () => {
			const random = createSeededRandom(555);

			const result = shuffleArray([], random);

			expect(result).toEqual([]);
		});

		it("handles single element array", () => {
			const random = createSeededRandom(666);

			const result = shuffleArray([42], random);

			expect(result).toEqual([42]);
		});

		it("produces different results for different random functions", () => {
			const random1 = createSeededRandom(777);
			const random2 = createSeededRandom(888);

			const input = [1, 2, 3, 4, 5];
			const shuffled1 = shuffleArray(input, random1);
			const shuffled2 = shuffleArray(input, random2);

			expect(shuffled1).not.toEqual(shuffled2);
		});

		it("shuffles strings", () => {
			const random = createSeededRandom(999);
			const input = ["alice", "bob", "charlie", "david"];

			const shuffled = shuffleArray(input, random);

			expect(shuffled).toHaveLength(4);
			expect(shuffled.sort()).toEqual(input.sort());
		});
	});
});
