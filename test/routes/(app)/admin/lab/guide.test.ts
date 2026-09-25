import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth/authz", () => ({ requireAdmin: (event: { locals: { user: unknown } }) => event.locals.user }));

import { load } from "$routes/(app)/admin/lab/+page.server";
import { LAB_GUIDE } from "$routes/(app)/admin/lab/guide-content";

function shape(language: "zh" | "en") {
	return LAB_GUIDE[language].sections.map((section) => ({
		id: section.id,
		blocks: section.blocks.map((block) => (block.kind === "p" || block.kind === "note" ? block.kind : `${block.kind}:${block.items.length}`)),
	}));
}

function event(query: string, nativeLanguage: string | null) {
	return { locals: { user: { nativeLanguage } }, url: new URL(`https://example.com/admin/lab${query}`) } as never;
}

describe("LLM Lab guide", () => {
	it("keeps Chinese and English in step, section by section and item by item", () => {
		expect(shape("zh")).toEqual(shape("en"));
	});

	it("follows the requested language, else the admin's native language", async () => {
		await expect(load(event("?lang=en", "zh"))).resolves.toEqual({ language: "en" });
		await expect(load(event("", "zh"))).resolves.toEqual({ language: "zh" });
		await expect(load(event("?lang=xx", "fr"))).resolves.toEqual({ language: "en" });
	});
});
