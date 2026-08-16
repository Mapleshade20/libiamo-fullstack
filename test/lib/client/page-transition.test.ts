import { describe, expect, it } from "vitest";
import { resolvePageTransition, setNavbarTransitionIntent } from "$lib/client/page-transition";

const now = new Date(2025, 5, 11, 12, 0, 0).getTime();

function url(path: string) {
	return new URL(path, "https://libiamo.test");
}

describe("page transition intent", () => {
	it.each([
		["forward", "navbar-forward"],
		["backward", "navbar-backward"],
	] as const)("resolves a matching %s navbar navigation once", (direction, expected) => {
		setNavbarTransitionIntent(url("/archive"), direction, now);

		expect(resolvePageTransition(url("/"), url("/archive"), now + 100)).toBe(expected);
		expect(resolvePageTransition(url("/"), url("/archive"), now + 200)).toBe("fade");
	});

	it("does not apply stale intent to a different destination", () => {
		setNavbarTransitionIntent(url("/archive"), "forward", now);

		expect(resolvePageTransition(url("/"), url("/review"), now + 100)).toBe("fade");
		expect(resolvePageTransition(url("/"), url("/archive"), now + 200)).toBe("fade");
	});

	it("expires intent that did not produce an immediate navigation", () => {
		setNavbarTransitionIntent(url("/archive"), "forward", now);

		expect(resolvePageTransition(url("/"), url("/archive"), now + 1_501)).toBe("fade");
	});

	it("includes search and hash state in the destination", () => {
		setNavbarTransitionIntent(url("/review?language=es#queue"), "backward", now);

		expect(resolvePageTransition(url("/"), url("/review?language=fr#queue"), now + 100)).toBe("fade");
	});

	it("skips document transitions when only query or hash state changes", () => {
		expect(resolvePageTransition(url("/review?language=en"), url("/review?language=es"), now)).toBe("none");
		expect(resolvePageTransition(url("/review/manage?page=1"), url("/review/manage?page=2#cards"), now)).toBe("none");
	});

	it("uses a stable-section fade between Review Study and Manage", () => {
		expect(resolvePageTransition(url("/review?language=es"), url("/review/manage?language=es"), now)).toBe("section-fade");
		expect(resolvePageTransition(url("/review/manage"), url("/review"), now)).toBe("section-fade");
	});
});
