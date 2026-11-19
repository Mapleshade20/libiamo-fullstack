import { expect, it } from "vitest";
import { RECOMMENDED, RECOMMENDED_FOR, recommendedFor, SETUPS } from "#lib/llm/providers.ts";

it("recommends a language's own setup when one is named for it, the one worked in deciding first, else the default", () => {
	const chinese = RECOMMENDED_FOR["zh-CN"];
	expect(chinese).toBeDefined();
	expect(chinese).not.toBe(RECOMMENDED);
	expect(recommendedFor(["es", "fr"])).toBe(RECOMMENDED);
	expect(recommendedFor([])).toBe(RECOMMENDED);
	expect(recommendedFor(["zh-CN"])).toBe(chinese);
	// Learning Spanish and Chinese: the one key should serve Chinese well, whichever is worked in.
	expect(recommendedFor(["es", "zh-CN"])).toBe(chinese);
});

it("names only setups the key form offers", () => {
	for (const s of [RECOMMENDED, ...Object.values(RECOMMENDED_FOR)]) expect(SETUPS).toContain(s);
});
