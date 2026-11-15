import { type AppLang, isAppLang } from "#lib/constants.ts";
import { browser } from "$app/env";

/*
 * The interface strings: catalog/source.json (en and zh-CN by hand), translated into the other interface languages
 * (catalog/ui.json). The root layout's load brings the ones a page speaks (English always, as the fallback); another
 * is fetched when first needed. Every language holds the same strings for everyone, so the server keeps one copy.
 */
type Dict = Record<string, string>;
const dicts = $state<Partial<Record<AppLang, Dict>>>({});
const pending = new Map<string, Promise<void>>();

/** A language's strings, brought by the root layout's load. */
export function provideLang(lang: AppLang, dict: Dict) {
	if (!dicts[lang]) dicts[lang] = dict;
}
export const hasLang = (lang: string) => !!dicts[lang as AppLang];

export function loadLang(lang: string): Promise<void> {
	const l = isAppLang(lang) ? lang : "en";
	if (dicts[l] || !browser) return Promise.resolve();
	let p = pending.get(l);
	if (!p) {
		p = fetch(`/api/i18n/${l}`)
			.then((r) => r.json())
			.then((d: Dict) => {
				dicts[l] = d;
			});
		pending.set(l, p);
	}
	return p;
}

export function t(lang: string, key: string, vars: Record<string, string | number> = {}): string {
	const s = dicts[lang as AppLang]?.[key] ?? dicts.en?.[key] ?? key;
	return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
/** Whether a string exists (some keys are optional per language). */
export const hasKey = (lang: string, key: string) => key in (dicts[lang as AppLang] ?? {}) || key in (dicts.en ?? {});
