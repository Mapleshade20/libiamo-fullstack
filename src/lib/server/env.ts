import { isLanguageCode, LANGUAGE_CODES, type LanguageCode } from "$lib/constants";

/**
 * On/off environment variables. Examples write `1`/`0`; `true`/`false`, `yes`/`no` and `on`/`off`
 * are accepted too, case-insensitively. Empty or unrecognised values fall back to the default.
 */
export function envFlag(value: string | undefined, fallback: boolean): boolean {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
	if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
	return fallback;
}

let warnedAllLanguagesDisabled = false;

/**
 * `DISABLED_LANGUAGES`: comma-separated learning languages (`es,ja`) that are opening soon. Sign-up
 * and the Hall's switcher show them but refuse them; learners already studying one are unaffected.
 * Unknown codes are dropped, and a list covering every language is ignored, since nobody could sign up.
 */
export function disabledLanguages(value: string | undefined): LanguageCode[] {
	const codes = [...new Set((value ?? "").split(",").map((code) => code.trim().toLowerCase()))].filter(isLanguageCode);
	if (codes.length < LANGUAGE_CODES.length) return codes;
	if (!warnedAllLanguagesDisabled) console.warn("DISABLED_LANGUAGES lists every language; ignoring it.");
	warnedAllLanguagesDisabled = true;
	return [];
}
