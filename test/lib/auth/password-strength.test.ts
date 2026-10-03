import { describe, expect, it } from "vitest";
import { checkPasswordStrength, WEAK_PASSWORD_MESSAGE } from "$lib/auth/password-strength";
import { AUTH_PASSWORD_MAX_LENGTH } from "$lib/constants";

describe("checkPasswordStrength", () => {
	it("accepts a password zxcvbn scores at least 2", async () => {
		await expect(checkPasswordStrength("Velvet-otter-harbor-92")).resolves.toEqual({ ok: true });
	});

	it("rejects a common password with zxcvbn's warning as a sentence", async () => {
		const result = await checkPasswordStrength("password1");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.warning).toMatch(/\.$/);
	});

	it("counts the learner's name and email local part as guessable", async () => {
		await expect(checkPasswordStrength("lindqvist1")).resolves.toEqual({ ok: true });
		await expect(checkPasswordStrength("lindqvist1", ["lindqvist@gmail.com"])).resolves.toMatchObject({ ok: false });
	});

	it("falls back to general advice when zxcvbn has no specific warning", async () => {
		const result = await checkPasswordStrength("kx8#q2");
		expect(result).toEqual({ ok: false, warning: WEAK_PASSWORD_MESSAGE });
	});

	it("refuses a password over the length cap", async () => {
		await expect(checkPasswordStrength("Velvet-otter-harbor-92".repeat(4).slice(0, AUTH_PASSWORD_MAX_LENGTH))).resolves.toEqual({ ok: true });
		await expect(checkPasswordStrength("a".repeat(AUTH_PASSWORD_MAX_LENGTH + 1))).resolves.toMatchObject({ ok: false });
	});
});
