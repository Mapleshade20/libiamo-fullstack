import { describe, expect, it } from "vitest";
import { clientIp } from "$lib/server/auth/audit";

describe("clientIp", () => {
	it("trusts the proxy's X-Real-IP over a client-supplied X-Forwarded-For", () => {
		expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 172.64.0.1" }))).toBe("203.0.113.7");
	});

	it("falls back to the first forwarded hop, then to nothing", () => {
		expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
		expect(clientIp(new Headers())).toBeNull();
		expect(clientIp(null)).toBeNull();
	});
});
