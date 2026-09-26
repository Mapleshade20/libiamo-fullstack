import { describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock("$lib/server/llm/client", () => ({ getEnvOpenAIConfig: vi.fn(), getUserOpenAIConfig: vi.fn() }));

import { isProviderRef, labProviders, resolveProviderRef } from "$lib/server/llm/providers";

const raw = JSON.stringify([
	{ id: "fast", label: "Fast", baseUrl: "https://fast.test/v1", apiKey: "k1", model: "m1" },
	{ id: "broken", baseUrl: "not a url", apiKey: "k2", model: "m2" },
]);

describe("lab providers", () => {
	it("parses valid entries and skips invalid ones", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(labProviders(raw).map((provider) => provider.id)).toEqual(["fast"]);
		expect(labProviders("not json")).toEqual([]);
		warn.mockRestore();
	});

	it("recognizes provider refs", () => {
		expect(["default", "byok", "lab:fast"].every(isProviderRef)).toBe(true);
		expect(isProviderRef("lab:")).toBe(false);
		expect(isProviderRef("openai")).toBe(false);
	});

	it("rejects unknown lab providers", async () => {
		await expect(resolveProviderRef("lab:missing", "u1")).rejects.toThrow("not available");
	});
});
