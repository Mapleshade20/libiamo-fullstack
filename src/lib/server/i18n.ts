import { type AppLang, isAppLang } from "#lib/constants.ts";
import source from "#lib/i18n/catalog/source.json";
import ui from "#lib/i18n/catalog/ui.json";

/* One language's interface strings (catalog/ui.json, written by the i18n script). The hand-written English and Chinese
   (catalog/source.json) win, so a string added there shows at once, before the other languages are translated. */
const all: Record<string, Record<string, string>> = ui;
const src: Record<string, Record<string, string>> = source;
export const dictOf = (lang: string): Record<string, string> => ({ ...(all[lang] ?? all.en), ...(src[lang] ?? {}) });

/** The strings a page needs: each language asked for that the interface has, English always. */
export function dictsFor(...langs: string[]): Partial<Record<AppLang, Record<string, string>>> {
	const want = new Set<AppLang>(["en", ...langs.filter(isAppLang)]);
	return Object.fromEntries([...want].map((l) => [l, dictOf(l)]));
}
