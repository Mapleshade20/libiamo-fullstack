import { describe, expect, it } from "vitest";
import { safeImageUrl } from "$lib/image-url";

describe("safeImageUrl", () => {
	it("accepts a valid public HTTPS image URL", () => {
		expect(safeImageUrl("https://cdn.example.com/avatar.png")).toBe("https://cdn.example.com/avatar.png");
	});

	it("accepts a valid HTTPS URL with path and query string", () => {
		expect(safeImageUrl("https://img.example.com/icons/user.png?v=2")).toBe("https://img.example.com/icons/user.png?v=2");
	});

	it("returns null for undefined input", () => {
		expect(safeImageUrl(undefined)).toBeNull();
	});

	it("returns null for null input", () => {
		expect(safeImageUrl(null)).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(safeImageUrl("")).toBeNull();
	});

	it("returns null for whitespace-only string", () => {
		expect(safeImageUrl("   ")).toBeNull();
	});

	it("returns null for non-URL string", () => {
		expect(safeImageUrl("not a url")).toBeNull();
	});

	it("returns null for overly long URL", () => {
		expect(safeImageUrl(`https://example.com/${"x".repeat(3000)}`)).toBeNull();
	});

	// ── Protocol checks ──────────────────────────────────────────────

	it("rejects HTTP URLs", () => {
		expect(safeImageUrl("http://example.com/x.png")).toBeNull();
	});

	it("rejects javascript: scheme", () => {
		expect(safeImageUrl("javascript:alert(1)")).toBeNull();
	});

	it("rejects data: scheme", () => {
		expect(safeImageUrl("data:image/svg+xml,<svg/>")).toBeNull();
	});

	it("rejects ftp: scheme", () => {
		expect(safeImageUrl("ftp://example.com/file.png")).toBeNull();
	});

	// ── Credential checks ────────────────────────────────────────────

	it("rejects URLs with embedded credentials", () => {
		expect(safeImageUrl("https://user:pass@example.com/x.png")).toBeNull();
	});

	it("rejects URLs with username only", () => {
		expect(safeImageUrl("https://user@example.com/x.png")).toBeNull();
	});

	// ── Private / loopback IPv4 ──────────────────────────────────────

	it("rejects 127.0.0.1 (loopback)", () => {
		expect(safeImageUrl("https://127.0.0.1/x.png")).toBeNull();
	});

	it("rejects 127.0.0.2 (loopback range)", () => {
		expect(safeImageUrl("https://127.0.0.2/x.png")).toBeNull();
	});

	it("rejects 10.0.0.5 (private class A)", () => {
		expect(safeImageUrl("https://10.0.0.5/x.png")).toBeNull();
	});

	it("rejects 172.16.0.1 (private class B)", () => {
		expect(safeImageUrl("https://172.16.0.1/x.png")).toBeNull();
	});

	it("rejects 192.168.1.1 (private class C)", () => {
		expect(safeImageUrl("https://192.168.1.1/x.png")).toBeNull();
	});

	it("rejects 169.254.169.254 (link-local / metadata)", () => {
		expect(safeImageUrl("https://169.254.169.254/latest/meta-data/")).toBeNull();
	});

	it("rejects 0.0.0.0", () => {
		expect(safeImageUrl("https://0.0.0.0/x.png")).toBeNull();
	});

	// ── Private / loopback IPv6 ──────────────────────────────────────

	it("rejects [::1] (IPv6 loopback)", () => {
		expect(safeImageUrl("https://[::1]/x.png")).toBeNull();
	});

	it("rejects IPv6 ULA fc00:: (unique local)", () => {
		expect(safeImageUrl("https://[fc00::1]/x.png")).toBeNull();
	});

	it("rejects IPv6 ULA fd00:: (unique local)", () => {
		expect(safeImageUrl("https://[fd12:3456::1]/x.png")).toBeNull();
	});

	it("rejects IPv6 link-local fe80::", () => {
		expect(safeImageUrl("https://[fe80::1]/x.png")).toBeNull();
	});

	// ── Hostname-based blocks ────────────────────────────────────────

	it("rejects localhost", () => {
		expect(safeImageUrl("https://localhost/x.png")).toBeNull();
	});

	it("rejects subdomain of localhost", () => {
		expect(safeImageUrl("https://sub.localhost/x.png")).toBeNull();
	});

	it("rejects .local hostname", () => {
		expect(safeImageUrl("https://host.local/x.png")).toBeNull();
	});
});
