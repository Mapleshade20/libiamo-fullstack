import { readdirSync } from "node:fs";
import { assert, test } from "vitest";
import { metaOf, PUBLIC_PAGES, routePath, SIGNED_IN_PATHS } from "#lib/seo.ts";

const ROUTES = new URL("../../src/routes/", import.meta.url);
/** The first segment of every address a route answers at, route groups looked through. */
function tops(dir: URL): string[] {
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.flatMap((e) => (/^\(.+\)$/.test(e.name) ? tops(new URL(`${e.name}/`, dir)) : [e.name]));
}

test("crawlers are kept off every signed-in page, and only those", () => {
	const groups = (g: string) => tops(new URL(`${g}/`, ROUTES));
	const open = new Set([...groups("(public)"), ...groups("(focus)/(auth)")]);
	const signedIn = [...groups("(app)"), ...groups("(focus)")].filter((t) => !open.has(t));
	for (const t of signedIn)
		assert.ok(
			SIGNED_IN_PATHS.some((p) => p.replace(/\/$/, "") === `/${t}`),
			`/${t} is not in SIGNED_IN_PATHS`,
		);
	for (const t of open)
		assert.notOk(
			SIGNED_IN_PATHS.some((p) => p.startsWith(`/${t}`)),
			`/${t} is open`,
		);
});

test("every public page is listed, and only they are indexed", () => {
	assert.sameMembers(
		PUBLIC_PAGES.map((p) => p.path),
		tops(new URL("(public)/", ROUTES)).map((t) => `/${t}`),
	);
	const about = metaOf("https://libiamo.test", "/(public)/about");
	assert.equal(about.robots, "index, follow");
	assert.equal(about.canonical, "https://libiamo.test/about");
	const signIn = metaOf("https://libiamo.test", "/(focus)/(auth)/sign-in");
	assert.equal(signIn.robots, "noindex");
	assert.isNull(signIn.canonical);
	assert.equal(metaOf("https://libiamo.test", null).robots, "noindex");
});

test("a route's address looks through its groups", () => {
	assert.equal(routePath("/(focus)/(auth)/sign-in"), "/sign-in");
	assert.equal(routePath("/(app)"), "/");
});
