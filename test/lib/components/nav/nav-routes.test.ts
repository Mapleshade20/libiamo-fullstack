import { describe, expect, it } from "vitest";
import { activeNavIndex, appNavRoutes } from "$lib/components/nav/nav-routes";

describe("shared app navigation", () => {
	it.each(["", "/learn"])("keeps Admin active throughout its subtree with base %s", (base) => {
		const routes = appNavRoutes(base, "admin", "avatar.png");
		for (const path of [
			"/admin",
			"/admin/templates",
			"/admin/templates/new",
			"/admin/templates/42",
			"/admin/schedule",
			"/admin/reviews/7",
			"/admin/future-tool",
		]) {
			expect(routes[activeNavIndex(routes, base + path)]?.label).toBe("Admin");
		}
		expect(routes[activeNavIndex(routes, `${base}/profile`)]?.label).toBe("Profile");
		expect(activeNavIndex(routes, `${base}/administrator`)).toBe(-1);
		expect(activeNavIndex(routes, `${base}/review-other`)).toBe(-1);
	});

	it("does not expose Admin to learners", () => {
		const routes = appNavRoutes("", "learner", "avatar.png");
		expect(routes.some((route) => route.label === "Admin")).toBe(false);
		expect(routes[activeNavIndex(routes, "/contribute")]?.label).toBe("Contribute");
	});

	it("selects the parent tool on nested pages without matching sibling prefixes", () => {
		const routes = [{ href: "/learn/admin/templates" }, { href: "/learn/admin/reviews" }];
		expect(activeNavIndex(routes, "/learn/admin/reviews/7")).toBe(1);
		expect(activeNavIndex(routes, "/learn/admin/reviews-other")).toBe(-1);
	});
});
