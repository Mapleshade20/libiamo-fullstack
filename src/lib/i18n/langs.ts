import { APP_LANGS, type AppLang, RTL_LANGS, UNSPACED_LANGS } from "#lib/constants.ts";

/** The interface language a browser asks for (its languages, most wanted first). Chinese is Simplified only: zh-TW,
 *  zh-HK and zh-Hant do not pick it. */
export function appLangOf(tags: readonly string[]): AppLang {
	for (const raw of tags) {
		const tag = raw.trim().toLowerCase();
		if (/^zh\b/.test(tag)) {
			if (!/hant|tw|hk|mo/.test(tag)) return "zh-CN";
			continue;
		}
		const found = APP_LANGS.find((l) => l !== "zh-CN" && (tag === l || tag.startsWith(`${l}-`)));
		if (found) return found;
	}
	return "en";
}

/** `<html lang>` for a language code. */
export const htmlLang = (l: string) => (l === "zh-CN" ? "zh-Hans" : l);
export const dirOf = (l: string) => (RTL_LANGS.includes(l) ? "rtl" : "ltr");
/** Whether a language puts spaces between its words (Chinese, Japanese and Thai do not). */
export const spacesWords = (l: string) => !UNSPACED_LANGS.includes(l);
