import { describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {
		BETTER_AUTH_SECRET: "test-secret-for-api-key-encryption",
	},
}));

vi.mock("$env/dynamic/private", () => ({
	env: mockEnv,
}));

vi.mock("node:dns/promises", () => ({
	lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import { decryptApiKey, encryptApiKey, verifyApiKey } from "$lib/server/api-key-crypto";

describe("api-key-crypto", () => {
	describe("encryptApiKey / decryptApiKey", () => {
		it("round-trips a plaintext API key", () => {
			const original = "sk-test-key-12345";
			const encrypted = encryptApiKey(original);
			expect(encrypted).not.toBe(original);
			expect(encrypted.split(":")).toHaveLength(3);

			const decrypted = decryptApiKey(encrypted);
			expect(decrypted).toBe(original);
		});

		it("produces different ciphertext for the same plaintext (random IV)", () => {
			const key = "sk-same-key";
			const a = encryptApiKey(key);
			const b = encryptApiKey(key);
			expect(a).not.toBe(b);
			expect(decryptApiKey(a)).toBe(key);
			expect(decryptApiKey(b)).toBe(key);
		});

		it("throws on malformed ciphertext", () => {
			expect(() => decryptApiKey("garbage")).toThrow("Invalid encrypted API key format");
			expect(() => decryptApiKey("a:b")).toThrow("Invalid encrypted API key format");
		});

		it("throws on tampered ciphertext", () => {
			const encrypted = encryptApiKey("sk-secret");
			const parts = encrypted.split(":");
			const tamperedHex = parts[2].replace(/[0-9a-f]/, (c) => (c === "f" ? "0" : "f"));
			const tampered = `${parts[0]}:${parts[1]}:${tamperedHex}`;
			expect(() => decryptApiKey(tampered)).toThrow();
		});

		it("throws when BETTER_AUTH_SECRET is not set", async () => {
			mockEnv.BETTER_AUTH_SECRET = "";
			expect(() => encryptApiKey("sk-xxx")).toThrow("BETTER_AUTH_SECRET is not set");
			mockEnv.BETTER_AUTH_SECRET = "test-secret-for-api-key-encryption";
		});
	});

	describe("verifyApiKey", () => {
		it("returns ok:true on successful verification", async () => {
			const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: "Hi!" } }] }, { status: 200 }));
			vi.stubGlobal("fetch", fetchMock);

			const result = await verifyApiKey("https://api.example.com/v1", "sk-valid", "test-model");

			expect(result.ok).toBe(true);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
			expect(url).toBe("https://api.example.com/v1/chat/completions");
			expect(init.redirect).toBe("manual");
			expect(JSON.parse(String(init.body))).toMatchObject({
				model: "test-model",
				messages: [{ role: "user", content: "Hi" }],
				max_tokens: 1,
			});
		});

		it("returns ok:false on HTTP error", async () => {
			const fetchMock = vi.fn(async () => Response.json({ error: { message: "Invalid API Key" } }, { status: 401 }));
			vi.stubGlobal("fetch", fetchMock);

			const result = await verifyApiKey("https://api.example.com/v1", "sk-invalid", "test-model");

			expect(result.ok).toBe(false);
			expect("error" in result && result.error).toContain("401");
		});

		it("returns ok:false on network error", async () => {
			const fetchMock = vi.fn(async () => {
				throw new Error("Connection refused");
			});
			vi.stubGlobal("fetch", fetchMock);

			const result = await verifyApiKey("https://api.example.com/v1", "sk-key", "test-model");

			expect(result.ok).toBe(false);
			expect("error" in result && result.error).toContain("Connection refused");
		});

		it("strips trailing slash from baseUrl", async () => {
			const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: "ok" } }] }, { status: 200 }));
			vi.stubGlobal("fetch", fetchMock);

			await verifyApiKey("https://api.example.com/v1/", "sk-key", "m");

			const [url] = fetchMock.mock.calls[0] as unknown as [string];
			expect(url).toBe("https://api.example.com/v1/chat/completions");
		});

		it("returns ok:false without fetching when baseUrl is disallowed", async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const result = await verifyApiKey("ftp://api.example.com/v1", "sk-key", "m");

			expect(result.ok).toBe(false);
			expect("error" in result && result.error).toContain("HTTPS");
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("handles non-JSON error response body", async () => {
			const fetchMock = vi.fn(async () => new Response("Plain text error", { status: 500 }));
			vi.stubGlobal("fetch", fetchMock);

			const result = await verifyApiKey("https://api.example.com/v1", "sk-key", "m");

			expect(result.ok).toBe(false);
			expect("error" in result && result.error).toContain("HTTP 500");
		});

		it("returns ok:false on fetch abort (timeout)", async () => {
			const fetchMock = vi.fn(async () => {
				const err = new Error("aborted");
				err.name = "AbortError";
				throw err;
			});
			vi.stubGlobal("fetch", fetchMock);

			const result = await verifyApiKey("https://api.example.com/v1", "sk-key", "m");

			expect(result.ok).toBe(false);
			expect("error" in result && result.error).toContain("timed out");
		});

		it("handles error response with null error object", async () => {
			const fetchMock = vi.fn(
				async () =>
					new Response(JSON.stringify({ error: null }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const result = await verifyApiKey("https://api.example.com/v1", "sk-key", "m");

			expect(result.ok).toBe(false);
			expect("error" in result && result.error).toContain("HTTP 400");
		});
	});
});
