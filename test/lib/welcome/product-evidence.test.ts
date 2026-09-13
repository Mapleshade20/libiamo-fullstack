import { describe, expect, it } from "vitest";
import { WELCOME_TRANSLATION_CASE } from "$lib/welcome/product-evidence";

describe("welcome product evidence", () => {
	it("keeps every visible feedback mark tied to a numbered annotation", () => {
		const annotationIds = new Set(WELCOME_TRANSLATION_CASE.annotations.map((annotation) => annotation.id));
		const markedParts = [...WELCOME_TRANSLATION_CASE.firstDraftParts, ...WELCOME_TRANSLATION_CASE.referenceParts].filter(
			(part) => part.type === "mark",
		);

		expect(markedParts).not.toHaveLength(0);
		for (const part of markedParts) expect(annotationIds.has(part.annotation)).toBe(true);
	});
});
