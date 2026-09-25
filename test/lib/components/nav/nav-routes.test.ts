import { describe, expect, it } from "vitest";
import { activeNavIndex, appNavRoutes } from "$lib/components/nav/nav-routes";
import { t } from "$lib/i18n";

describe("shared app navigation", () => {
	it.each(["", "/learn"])("keeps Admin active throughout its subtree with base %s", (base) => {
		const routes = appNavRoutes(base, "admin", "avatar.png", "en");
		for (const path of [
			"/admin",
			"/admin/templates",
			"/admin/templates/new",
			"/admin/templates/42",
			"/admin/schedule",
			"/admin/reviews/7",
			"/admin/future-tool",
		]) {
			expect(routes[activeNavIndex(routes, base + path)]?.href).toBe(`${base}/admin/templates`);
		}
		expect(routes[activeNavIndex(routes, `${base}/profile`)]?.href).toBe(`${base}/profile`);
		expect(activeNavIndex(routes, `${base}/administrator`)).toBe(-1);
		expect(activeNavIndex(routes, `${base}/review-other`)).toBe(-1);
	});

	it("does not expose Admin to learners", () => {
		const routes = appNavRoutes("", "learner", "avatar.png", "en");
		expect(routes.some((route) => route.href.startsWith("/admin"))).toBe(false);
		expect(routes[activeNavIndex(routes, "/contribute")]?.href).toBe("/contribute");
	});

	it("labels the rail in the learner's own language", () => {
		const routes = appNavRoutes("", "learner", "avatar.png", "ja");
		const keys = ["nav.home", "nav.review", "nav.archive", "nav.contribute", "nav.profile"];
		expect(routes.map((route) => route.label)).toEqual(keys.map((key) => t("ja", key)));
	});

	it("selects the parent tool on nested pages without matching sibling prefixes", () => {
		const routes = [{ href: "/learn/admin/templates" }, { href: "/learn/admin/reviews" }];
		expect(activeNavIndex(routes, "/learn/admin/reviews/7")).toBe(1);
		expect(activeNavIndex(routes, "/learn/admin/reviews-other")).toBe(-1);
	});
});
