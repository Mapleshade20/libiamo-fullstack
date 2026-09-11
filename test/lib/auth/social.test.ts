import { describe, expect, it } from "vitest";
import { isSocialProviderId, socialAuthErrorMessage } from "$lib/auth/social";

describe("social auth UI helpers", () => {
	it("recognizes supported providers", () => {
		expect(isSocialProviderId("google")).toBe(true);
		expect(isSocialProviderId("github")).toBe(true);
		expect(isSocialProviderId("microsoft")).toBe(false);
	});

	it("maps cancellation separately from provider failures", () => {
		expect(socialAuthErrorMessage(null)).toBeNull();
		expect(socialAuthErrorMessage("access_denied")).toBe("Sign-in was canceled. You can try again when you’re ready.");
		expect(socialAuthErrorMessage("signup_disabled")).toBe("To create a new Libiamo account, choose Sign Up below and select a learning language.");
		expect(socialAuthErrorMessage("unable_to_create_user")).toBe("Google or GitHub sign-in could not be completed. Please try again.");
	});
});
