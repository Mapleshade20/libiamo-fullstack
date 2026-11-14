import { describe, expect, it, vi } from "vitest";

vi.mock("$app/env/private", () => ({ BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-for-it" }));
const { decryptKey, encryptKey } = await import("#lib/server/account/key.ts");

describe("a learner's key at rest", () => {
	it("comes back as it went in, and differs every time it is stored", () => {
		const a = encryptKey("sk-or-v1-abc");
		expect(decryptKey(a)).toBe("sk-or-v1-abc");
		expect(encryptKey("sk-or-v1-abc")).not.toBe(a);
	});

	it("refuses a stored value that was tampered with", () => {
		const [iv, tag, data] = encryptKey("sk-or-v1-abc").split(":");
		const flipped = `${data.slice(0, -1)}${data.endsWith("0") ? "1" : "0"}`;
		expect(() => decryptKey(`${iv}:${tag}:${flipped}`)).toThrow();
	});
});
