import { describe, expect, it } from "vitest";
import {
	accountActionErrorResult,
	isSocialProviderId,
	OAUTH_EMAIL_NOT_VERIFIED_MESSAGE,
	socialAuthErrorMessage,
	socialAuthFailure,
} from "$lib/auth/social";

describe("social auth UI helpers", () => {
	it("recognizes supported providers", () => {
		expect(isSocialProviderId("google")).toBe(true);
		expect(isSocialProviderId("github")).toBe(true);
		expect(isSocialProviderId("microsoft")).toBe(false);
	});

	describe("socialAuthFailure", () => {
		it.each([
			["access_denied", "cancelled"],
			["account_not_linked", "account-exists"],
			["account_already_linked_to_different_user", "already-linked-elsewhere"],
			["unable_to_link_account", "provider-email-unverified"],
			["invalid_code", "error"],
			["state_mismatch", "error"],
		])("classifies the %s callback parameter", (code, expected) => {
			expect(socialAuthFailure(code)).toBe(expected);
		});

		it("returns null when nothing failed", () => {
			expect(socialAuthFailure(null)).toBeNull();
			expect(socialAuthFailure(undefined)).toBeNull();
			expect(socialAuthFailure("")).toBeNull();
		});

		// API errors carry SCREAMING_SNAKE codes where the callback redirect uses
		// lowercase, and both reach this function.
		it("classifies API error codes regardless of case", () => {
			expect(socialAuthFailure("SESSION_NOT_FRESH")).toBe("stale-session");
			expect(socialAuthFailure("LINKING_NOT_ALLOWED")).toBe("provider-email-unverified");
		});

		// Better Auth's sign-up path discards the APIError code our `user.create.before`
		// hook throws and forwards only the message, with spaces turned into
		// underscores. If that ever stops matching, unverified provider emails would
		// silently fall back to the generic "please try again".
		it("classifies the rejection our own hook throws on the sign-up path", () => {
			const asCallbackParameter = OAUTH_EMAIL_NOT_VERIFIED_MESSAGE.split(" ").join("_");

			expect(socialAuthFailure(asCallbackParameter)).toBe("provider-email-unverified");
		});
	});

	describe("socialAuthErrorMessage", () => {
		it("explains the failures a signed-out user can act on", () => {
			expect(socialAuthErrorMessage(null)).toBeNull();
			expect(socialAuthErrorMessage("access_denied")).toBe("Authentication was canceled. You can try again when you’re ready.");
			expect(socialAuthErrorMessage("account_not_linked")).toContain("Sign in with your password");
			expect(socialAuthErrorMessage("account_already_linked_to_different_user")).toContain("already connected to a different Libiamo account");
			expect(socialAuthErrorMessage("unable_to_link_account")).toContain("has not verified this email address");
		});

		it("falls back to one generic message for everything else", () => {
			expect(socialAuthErrorMessage("unable_to_create_user")).toBe("Google or GitHub authentication could not be completed. Please try again.");
			expect(socialAuthErrorMessage("invalid_code")).toBe("Google or GitHub authentication could not be completed. Please try again.");
		});
	});

	describe("accountActionErrorResult", () => {
		it("keeps the actionable failures apart from the generic one", () => {
			expect(accountActionErrorResult("SESSION_NOT_FRESH")).toBe("stale-session");
			expect(accountActionErrorResult("LINKING_NOT_ALLOWED")).toBe("provider-email-unverified");
			expect(accountActionErrorResult("FAILED_TO_UNLINK_LAST_ACCOUNT")).toBe("error");
		});

		it("treats a missing code as a generic error rather than a success", () => {
			expect(accountActionErrorResult(undefined)).toBe("error");
			expect(accountActionErrorResult(null)).toBe("error");
		});
	});
});
