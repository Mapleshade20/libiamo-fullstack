import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "#lib/constants.ts";

/** zxcvbn's 0–4 scale; 2 is "somewhat guessable", roughly 10^8 guesses. */
export const MIN_PASSWORD_SCORE = 2;
/** The code Better Auth's hook refuses a weak password with; its message is one of the catalog keys below. */
export const WEAK_PASSWORD_CODE = "WEAK_PASSWORD";

/**
 * What is wrong with a password, as the catalog key the pages show (`auPwShort`, `auPwGuessable`), or null. zxcvbn
 * penalises pieces of `userInputs` (the address); it and its dictionaries are large, so they load on first use. The
 * pages ask first only to answer sooner: Better Auth's hook asks again for every way a password is set.
 */
export async function passwordProblem(password: string, userInputs: readonly string[] = []): Promise<"auPwShort" | "auPwGuessable" | null> {
	if (password.length < PASSWORD_MIN_LENGTH) return "auPwShort";
	if (password.length > PASSWORD_MAX_LENGTH) return "auPwGuessable";
	const { zxcvbn } = await import("zxcvbn-typescript");
	// The local part of an address is the guessable bit; the whole address rarely appears verbatim.
	const inputs = userInputs.flatMap((s) => (s.includes("@") ? [s, s.slice(0, s.lastIndexOf("@"))] : [s])).filter(Boolean);
	return zxcvbn(password, inputs).score >= MIN_PASSWORD_SCORE ? null : "auPwGuessable";
}

/** Starts fetching the estimator before a submission, e.g. when a password field gets focus. */
export function preloadPasswordStrength() {
	void import("zxcvbn-typescript").catch(() => {});
}
