import { describe, expect, it, vi } from "vitest";
import { GET } from "$routes/robots.txt/+server";

vi.mock("$app/paths", () => ({ base: "/mounted" }));
vi.mock("$env/dynamic/private", () => ({ env: { ORIGIN: "https://libiamo.test" } }));

describe("robots.txt", () => {
	it("advertises the mounted public sitemap and keeps crawlers out of signed-in surfaces", async () => {
		const response = await GET({ url: new URL("http://internal:3000/mounted/robots.txt") } as any);
		expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
		const body = await response.text();
		expect(body).toContain("User-agent: *");
		expect(body).toContain("Sitemap: https://libiamo.test/mounted/sitemap.xml");
		const disallowed = body.split("\n").filter((line) => line.startsWith("Disallow:"));
		expect(disallowed).toContain("Disallow: /mounted/task");
		expect(disallowed).toContain("Disallow: /mounted/api/");
		expect(disallowed).not.toContain("Disallow: /mounted/sign-in");
		expect(response.headers.get("Cache-Control")).toMatch(/max-age=\d+/);
	});
});
