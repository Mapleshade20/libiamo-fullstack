import { describe, expect, it } from "vitest";
import { createMemberPool, memberColor } from "$lib/components/practice/ui/discord/members";

describe("Discord member pool", () => {
	it("is stable for one task and varies between tasks", () => {
		expect(createMemberPool("6")).toEqual(createMemberPool("6"));
		expect(createMemberPool("6")).not.toEqual(createMemberPool("7"));
	});

	it("has one to three online and two to five offline bystanders, all with distinct names", () => {
		const pool = createMemberPool("42");
		const names = [pool.agent, ...pool.online, ...pool.offline].map((member) => member.name);

		expect(pool.online.length).toBeGreaterThanOrEqual(1);
		expect(pool.online.length).toBeLessThanOrEqual(3);
		expect(pool.offline.length).toBeGreaterThanOrEqual(2);
		expect(pool.offline.length).toBeLessThanOrEqual(5);
		expect(new Set(names).size).toBe(names.length);
		expect(pool.offline.every((member) => member.status === "Offline")).toBe(true);
	});

	it("colours a member by name, so every view of them agrees", () => {
		expect(memberColor("Nova")).toBe(memberColor("Nova"));
	});
});
