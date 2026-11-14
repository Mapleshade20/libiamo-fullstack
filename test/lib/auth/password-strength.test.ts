import { describe, expect, it } from "vitest";
import { passwordProblem } from "#lib/auth/password-strength.ts";

describe("passwordProblem", () => {
	it("names what is wrong with the keys the pages show", async () => {
		expect(await passwordProblem("short")).toBe("auPwShort");
		expect(await passwordProblem("password123")).toBe("auPwGuessable");
		expect(await passwordProblem("x".repeat(200))).toBe("auPwGuessable");
	});

	it("counts the address's local part as guessable", async () => {
		expect(await passwordProblem("adalovelace1815", ["adalovelace1815@example.test"])).toBe("auPwGuessable");
	});

	it("accepts a few uncommon words", async () => {
		expect(await passwordProblem("plum orchard lantern 47", ["ada@example.test"])).toBeNull();
	});
});
