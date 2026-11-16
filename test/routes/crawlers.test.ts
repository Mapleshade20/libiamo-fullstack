import { assert, test, vi } from "vitest";
import { GET as robots } from "../../src/routes/robots.txt/+server.ts";
import { GET as sitemap } from "../../src/routes/sitemap.xml/+server.ts";

vi.mock("$app/env/private", () => ({ ORIGIN: "https://libiamo.test" }));

test("robots.txt points to the sitemap at the public origin and keeps crawlers off the signed-in pages", async () => {
	const body = await robots().text();
	assert.include(body, "Sitemap: https://libiamo.test/sitemap.xml");
	const off = body.split("\n").filter((l) => l.startsWith("Disallow:"));
	assert.include(off, "Disallow: /api/");
	assert.include(off, "Disallow: /live");
	assert.notInclude(off, "Disallow: /sign-in");
	assert.notInclude(off, "Disallow: /");
});

test("the sitemap lists the public pages at the public origin", async () => {
	const res = sitemap();
	assert.match(res.headers.get("Content-Type") ?? "", /application\/xml/);
	const body = await res.text();
	assert.include(body, "<loc>https://libiamo.test/about</loc>");
	assert.include(body, "<loc>https://libiamo.test/privacy</loc>");
	assert.notInclude(body, "/sign-in");
});
