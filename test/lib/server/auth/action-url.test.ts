import { describe, expect, it } from "vitest";
import { isCanonicalActionUrl } from "$lib/server/auth/action-url";

describe("isCanonicalActionUrl", () => {
	it("accepts the URLs the app's own forms post to", () => {
		expect(isCanonicalActionUrl("POST", "/(app)/profile", "?/changeEmail")).toBe(true);
		// Default actions post to the page's own URL, which may carry a query.
		expect(isCanonicalActionUrl("POST", "/(auth)/sign-up", "")).toBe(true);
		expect(isCanonicalActionUrl("POST", "/(auth)/sign-in", "?error=access_denied")).toBe(true);
	});

	it.each([
		"?/changeEmail&;",
		"?x=1&/changeEmail",
		"?%2FchangeEmail",
		"?/changeEmail=1",
		"?/changeEmail&/changePassword",
	])("refuses %s, which a proxy rule for ?/changeEmail might not match", (search) => {
		expect(isCanonicalActionUrl("POST", "/(app)/profile", search)).toBe(false);
	});

	it("leaves other methods and pages alone", () => {
		expect(isCanonicalActionUrl("GET", "/(app)/profile", "?x=1&/changeEmail")).toBe(true);
		expect(isCanonicalActionUrl("POST", "/(app)/task/[id]", "?lineup=abc&/start")).toBe(true);
	});
});
