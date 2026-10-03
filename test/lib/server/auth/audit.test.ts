import { describe, expect, it } from "vitest";
import { clientIp } from "$lib/server/auth/audit";

describe("clientIp", () => {
	it("reads only the header adapter-node is configured to trust", () => {
		const headers = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" });
		expect(clientIp({ ADDRESS_HEADER: "X-Real-IP" }, headers)).toBe("203.0.113.7");
		expect(clientIp({ ADDRESS_HEADER: "X-Forwarded-For" }, new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
	});

	it("has no address without a configured header, whatever the client sends", () => {
		const headers = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" });
		expect(clientIp({}, headers)).toBeNull();
		expect(clientIp({ ADDRESS_HEADER: "X-Real-IP" }, new Headers())).toBeNull();
		expect(clientIp({ ADDRESS_HEADER: "X-Real-IP" }, null)).toBeNull();
	});
});
