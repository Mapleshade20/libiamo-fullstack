import { describe, expect, it } from "vitest";
import { hallTaskCardKey, toggleHallTaskCard } from "$lib/hall-task-card";

describe("hall task card state", () => {
	it("namespaces ordinary and translation task IDs", () => {
		expect(hallTaskCardKey("task", 7)).toBe("task:7");
		expect(hallTaskCardKey("translate", 7)).toBe("translate:7");
	});

	it("keeps only the most recently opened card expanded", () => {
		let current = toggleHallTaskCard(null, "task", 4);
		expect(current).toBe("task:4");

		current = toggleHallTaskCard(current, "translate", 9);
		expect(current).toBe("translate:9");

		current = toggleHallTaskCard(current, "task", 2);
		expect(current).toBe("task:2");
	});

	it("closes the current card when it is selected again", () => {
		expect(toggleHallTaskCard("translate:3", "translate", 3)).toBeNull();
	});
});
