import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth/authz", () => ({ requireAdmin: (event: { locals: { user: unknown } }) => event.locals.user }));

import { load } from "$routes/(app)/admin/lab/+page.server";

function event(query: string, nativeLanguage: string | null) {
	return { locals: { user: { nativeLanguage } }, url: new URL(`https://example.com/admin/lab${query}`) } as never;
}

describe("LLM Lab guide", () => {
	it("follows the requested language, else the admin's native language", async () => {
		await expect(load(event("?lang=en", "zh"))).resolves.toEqual({ language: "en" });
		await expect(load(event("", "zh"))).resolves.toEqual({ language: "zh" });
		await expect(load(event("?lang=xx", "fr"))).resolves.toEqual({ language: "en" });
	});
});
