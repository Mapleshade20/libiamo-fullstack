/** The interface languages (the main app's). */
export const APP_LANGS = ["en", "ru", "es", "de", "tr", "fa", "fr", "ja", "pt", "zh-CN", "vi", "it", "ar", "pl", "el", "nl", "id", "ko"] as const;
export type AppLang = (typeof APP_LANGS)[number];
/* What can be learnt here: the languages the models write and judge well. Scenarios are written by hand, so only some of
   them have any; the others get the whole tutor and notebook. */
export const LEARNABLE = ["en", "es", "fr", "de", "it", "pt", "ja", "ko", "zh-CN", "ru", "ar", "nl", "tr", "pl"] as const;
export const SCENARIO_LANGS = ["en", "es", "fr", "ja"] as const;
export const RTL_LANGS = ["ar", "fa"];

export const isAppLang = (l: unknown): l is AppLang => APP_LANGS.includes(l as AppLang);
export const hasScenarios = (l: string) => (SCENARIO_LANGS as readonly string[]).includes(l);

const cap1 = (s: string, l: string) => s.charAt(0).toLocaleUpperCase(l) + s.slice(1);
/** A language's name in another language ("zh-CN" is named by its script: 简体中文, Simplified Chinese). */
export function langName(code: string, inLang: string): string {
	try {
		return cap1(new Intl.DisplayNames([inLang], { type: "language" }).of(code === "zh-CN" ? "zh-Hans" : code) ?? code, inLang);
	} catch {
		return code;
	}
}
/** A language's own name for itself, as a switch lists them: a learner finds their language whatever the interface is in. */
export const endonym = (code: string) => langName(code, code);
