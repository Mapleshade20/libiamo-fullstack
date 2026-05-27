import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
	lookup: vi.fn(),
}));

import { normalizeByokBaseUrl } from "$lib/server/byok-url";

const lookupMock = vi.mocked(lookup as unknown as () => Promise<LookupAddress[]>);

describe("normalizeByokBaseUrl", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
	});

	it("normalizes a public HTTPS OpenAI-compatible base URL", async () => {
		await expect(normalizeByokBaseUrl(" https://api.example.com/v1/ ")).resolves.toBe("https://api.example.com/v1");
	});

	it("allows public IPv4 literal HTTPS base URLs", async () => {
		await expect(normalizeByokBaseUrl("https://124.64.247.88/v1/")).resolves.toBe("https://124.64.247.88/v1");
		expect(lookupMock).not.toHaveBeenCalled();
	});

	it("rejects HTTP", async () => {
		await expect(normalizeByokBaseUrl("http://api.example.com/v1")).rejects.toThrow("Base URL must use HTTPS.");
	});

	it("rejects credentials, query parameters, and fragments", async () => {
		await expect(normalizeByokBaseUrl("https://user:pass@api.example.com/v1")).rejects.toThrow("credentials");
		await expect(normalizeByokBaseUrl("https://api.example.com/v1?x=1")).rejects.toThrow("query");
		await expect(normalizeByokBaseUrl("https://api.example.com/v1#token")).rejects.toThrow("fragments");
	});

	it("rejects local hostnames by default", async () => {
		await expect(normalizeByokBaseUrl("https://localhost:11434/v1")).rejects.toThrow("private or local");
		await expect(normalizeByokBaseUrl("https://model.local/v1")).rejects.toThrow("private or local");
	});

	it("rejects private IP literals by default", async () => {
		await expect(normalizeByokBaseUrl("https://127.0.0.1:11434/v1")).rejects.toThrow("private or local");
		await expect(normalizeByokBaseUrl("https://192.168.1.2/v1")).rejects.toThrow("private or local");
		await expect(normalizeByokBaseUrl("https://[::1]:11434/v1")).rejects.toThrow("private or local");
		await expect(normalizeByokBaseUrl("https://[::ffff:172.16.0.1]/v1")).rejects.toThrow("private or local");
	});

	it("rejects DNS names that resolve to private addresses by default", async () => {
		lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

		await expect(normalizeByokBaseUrl("https://api.example.com/v1")).rejects.toThrow("resolve to a private or local address");
	});

	it("rejects local HTTP endpoints", async () => {
		await expect(normalizeByokBaseUrl("http://localhost:11434/v1/")).rejects.toThrow("Base URL must use HTTPS.");
		await expect(normalizeByokBaseUrl("http://127.0.0.1:11434/v1/")).rejects.toThrow("Base URL must use HTTPS.");
	});
});
