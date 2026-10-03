import { describe, expect, it } from "vitest";
import { captchaConfig } from "$lib/server/auth/captcha";

describe("captchaConfig", () => {
	it("is off with neither key and on with both", () => {
		expect(captchaConfig({})).toBeNull();
		expect(captchaConfig({ TURNSTILE_SITE_KEY: " ", TURNSTILE_SECRET_KEY: "" })).toBeNull();
		expect(captchaConfig({ TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" })).toEqual({ siteKey: "site", secretKey: "secret" });
	});

	it("refuses half a configuration instead of turning the check off", () => {
		expect(() => captchaConfig({ TURNSTILE_SITE_KEY: "site" })).toThrow();
		expect(() => captchaConfig({ TURNSTILE_SECRET_KEY: "secret" })).toThrow();
	});
});
