import { AUTH_PASSWORD_MAX_LENGTH } from "$lib/constants";

/** zxcvbn's 0–4 scale; 2 is "somewhat guessable", roughly 10^8 guesses. */
export const MIN_PASSWORD_SCORE = 2;

/** For a weak password zxcvbn has no specific warning about (its warning is then empty). */
export const WEAK_PASSWORD_MESSAGE = "This password is too easy to guess. Try a longer one with a few uncommon words.";

export const PASSWORD_TOO_LONG_MESSAGE = `Use at most ${AUTH_PASSWORD_MAX_LENGTH} characters.`;

/** The `APIError` code Better Auth's hook rejects a weak password with; its message is the warning. */
export const WEAK_PASSWORD_CODE = "WEAK_PASSWORD";

export type PasswordStrength = { ok: true } | { ok: false; warning: string };

/**
 * Scores `password` with zxcvbn, penalising pieces of `userInputs` (name, email). The estimator
 * and its dictionaries are several hundred KB, so they load on first use: pages that ask for a
 * password stay light, and a submission is the only thing that waits for them. Scoring is
 * synchronous and grows much faster than the input (a 512-character run takes seconds), so a
 * password over the length cap is refused without scoring it.
 */
export async function checkPasswordStrength(password: string, userInputs: readonly string[] = []): Promise<PasswordStrength> {
	if (password.length > AUTH_PASSWORD_MAX_LENGTH) return { ok: false, warning: PASSWORD_TOO_LONG_MESSAGE };
	const { zxcvbn } = await import("zxcvbn-typescript");
	// The local part of an address is the guessable bit; the whole address rarely appears verbatim.
	const inputs = userInputs.flatMap((input) => (input.includes("@") ? [input, input.slice(0, input.lastIndexOf("@"))] : [input])).filter(Boolean);
	const result = zxcvbn(password, inputs);
	if (result.score >= MIN_PASSWORD_SCORE) return { ok: true };
	const warning = result.feedback.warning;
	// zxcvbn's warnings are bare phrases ("This is a very common password").
	return { ok: false, warning: warning ? (/[.!?]$/.test(warning) ? warning : `${warning}.`) : WEAK_PASSWORD_MESSAGE };
}

/** Starts fetching the estimator ahead of a submission, for example when a password field gets focus. */
export function preloadPasswordStrength() {
	void import("zxcvbn-typescript").catch(() => {
		// The submission retries the import and reports its own failure.
	});
}
