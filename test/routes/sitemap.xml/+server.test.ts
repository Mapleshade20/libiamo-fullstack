import { describe, expect, it, vi } from "vitest";
import { GET } from "$routes/sitemap.xml/+server";

vi.mock("$app/paths", () => ({ base: "/mounted" }));
vi.mock("$env/dynamic/private", () => ({ env: { ORIGIN: "https://libiamo.test" } }));

describe("sitemap", () => {
	it("lists exactly the canonical public pages, not the root redirect, auth or learner pages", async () => {
		const response = await GET({ url: new URL("http://internal:3000/mounted/sitemap.xml") } as any);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
		const xml = await response.text();
		expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
		expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])).toEqual([
			"https://libiamo.test/mounted/welcome",
			"https://libiamo.test/mounted/changelog",
			"https://libiamo.test/mounted/privacy",
			"https://libiamo.test/mounted/terms",
		]);
		expect(xml).not.toMatch(/lastmod|priority|changefreq/);
	});
});
