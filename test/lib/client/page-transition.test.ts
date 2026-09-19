import { describe, expect, it } from "vitest";
import { isQuestMenuPath, resolvePageTransition, setNavbarTransitionIntent } from "$lib/client/page-transition";

const now = new Date(2025, 5, 11, 12, 0, 0).getTime();

function url(path: string) {
	return new URL(path, "https://libiamo.test");
}

describe("page transition intent", () => {
	it.each([
		["/?view=catalog", "/translate/17"],
		["/task/123", "/?view=catalog&section=weekly"],
		["/", "/task/123"],
		["/translate/17", "/"],
	])("leaves %s → %s to the persistent book animator", (from, to) => {
		setNavbarTransitionIntent(url(to), "backward", now);
		expect(resolvePageTransition(url(from), url(to), now)).toBe("none");
	});

	it.each([
		"/task/123/session",
		"/translate/17/attempt",
		"/translate/17/feedback",
		"/task",
		"/task/0",
		"/task/abc",
		"/review",
	])("does not classify workflow or unrelated route %s as a book view", (path) => {
		expect(isQuestMenuPath(path)).toBe(false);
		expect(resolvePageTransition(url("/translate/17"), url(path), now)).toBe("none");
	});
	it.each([
		["forward", "navbar-forward"],
		["backward", "navbar-backward"],
	] as const)("resolves a matching %s navbar navigation once", (direction, expected) => {
		setNavbarTransitionIntent(url("/archive"), direction, now);

		expect(resolvePageTransition(url("/"), url("/archive"), now + 100)).toBe(expected);
		expect(resolvePageTransition(url("/"), url("/archive"), now + 200)).toBe("none");
	});

	it("does not apply stale intent to a different destination", () => {
		setNavbarTransitionIntent(url("/archive"), "forward", now);

		expect(resolvePageTransition(url("/"), url("/review"), now + 100)).toBe("none");
		expect(resolvePageTransition(url("/"), url("/archive"), now + 200)).toBe("none");
	});

	it("expires intent that did not produce an immediate navigation", () => {
		setNavbarTransitionIntent(url("/archive"), "forward", now);

		expect(resolvePageTransition(url("/"), url("/archive"), now + 1_501)).toBe("none");
	});

	it("includes search and hash state in the destination", () => {
		setNavbarTransitionIntent(url("/review?language=es#queue"), "backward", now);

		expect(resolvePageTransition(url("/"), url("/review?language=fr#queue"), now + 100)).toBe("none");
	});

	it("skips document transitions when only query or hash state changes", () => {
		expect(resolvePageTransition(url("/review?language=en"), url("/review?language=es"), now)).toBe("none");
		expect(resolvePageTransition(url("/review/manage?page=1"), url("/review/manage?page=2#cards"), now)).toBe("none");
	});

	it("cuts rather than crossfades when no bar section was chosen", () => {
		expect(resolvePageTransition(url("/review?language=es"), url("/review/manage?language=es"), now)).toBe("none");
		expect(resolvePageTransition(url("/review/manage"), url("/review"), now)).toBe("none");
		expect(resolvePageTransition(null, url("/archive"), now)).toBe("none");
	});

	it("treats the account as a section of the bar like any other", () => {
		setNavbarTransitionIntent(url("/profile"), "forward", now);
		expect(resolvePageTransition(url("/"), url("/profile"), now + 100)).toBe("navbar-forward");

		setNavbarTransitionIntent(url("/archive"), "backward", now);
		expect(resolvePageTransition(url("/profile"), url("/archive"), now + 100)).toBe("navbar-backward");
	});
});
