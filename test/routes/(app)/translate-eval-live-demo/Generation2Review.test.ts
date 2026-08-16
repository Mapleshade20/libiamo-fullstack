import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";
import Generation2Review from "$routes/(app)/translate-eval-live-demo/Generation2Review.svelte";

describe("Generation2Review", () => {
	it("shows source-card coverage, bilingual definitions, and all generated examples", () => {
		const { body } = render(Generation2Review, {
			props: {
				result: {
					notes: [
						{
							sourceCardOrdinals: [0, 2],
							vocab: "be defined by",
							targetDefinition: "to have something as a defining feature",
							nativeDefinition: "以……为主要特征",
							examples: [
								{ nativeText: "第一道原文。", targetText: "The first target example is defined by detail." },
								{ nativeText: "第二道原文。", targetText: "The second target example is defined by care." },
								{ nativeText: "第三道原文。", targetText: "The third target example is defined by balance." },
								{ nativeText: "第四道原文。", targetText: "The fourth target example is defined by clarity." },
							],
						},
					],
				},
				promptMessages: [
					{ role: "system", content: "Generation 2 contract" },
					{ role: "user", content: '{"cards":[{"ordinal":0}]}' },
				],
				rawResponse: '{"notes":[]}',
				metadata: {
					temperature: 0.6,
					model: "deepseek-v4-flash",
					finishReason: "stop",
					usage: { promptTokens: 1937, completionTokens: 3731, totalTokens: 5668 },
					durationMs: 41_039,
					repairUsed: false,
				},
				submitting: false,
				error: null,
				onrun: vi.fn(),
			},
		});

		expect(body).toContain("be defined by");
		expect(body).toContain("以……为主要特征");
		expect(body).toContain("Source cards ·");
		expect(body).toContain("1, 3");
		expect(body.match(/Target example/g)).toHaveLength(4);
		expect(body).toContain("第一道原文。");
		expect(body).toContain("The fourth target example is defined by clarity.");
		expect(body).toContain("never written to the");
		expect(body).toContain("database");
		expect(body).toContain("Temperature");
		expect(body).toContain("deepseek-v4-flash");
		expect(body).toContain("1937");
		expect(body).toContain("Complete prompt · 2 messages");
		expect(body.indexOf("Complete prompt · 2 messages")).toBeLessThan(body.indexOf("Validated structured result"));
	});
});
