import { describe, expect, it } from "vitest";
import { hasAddresseeBeta } from "$lib/practice/addressee";

describe("addressee beta eligibility", () => {
	it("is offered on OpenRouter keys only", () => {
		expect(hasAddresseeBeta("https://openrouter.ai/api/v1")).toBe(true);
		expect(hasAddresseeBeta("https://openrouter.ai/api/v1/")).toBe(true);
		expect(hasAddresseeBeta("https://api.deepseek.com")).toBe(false);
		expect(hasAddresseeBeta(null)).toBe(false);
	});
});
