import { describe, expect, it } from "vitest";
import { initUserPool } from "$lib/components/practice-ui/mockUser";

describe("mockUser", () => {
	it("initializes deterministic user pool based on session ID", () => {
		const pool1 = initUserPool(1001);
		const pool2 = initUserPool(1001);
		const pool3 = initUserPool(9999);

		expect(pool1.agentUser.name).toEqual(pool2.agentUser.name);
		expect(pool1.onlineUsers.length).toBeGreaterThan(0);

		expect(pool1.agentUser.name).not.toEqual(pool3.agentUser.name);
	});
});
