import { loaders } from "virtual:i18n";
import { type AppLang, isAppLang } from "#lib/constants.ts";

/*
 * The interface strings: catalog/source.json (en and zh-CN by hand), translated into the other interface languages
 * (catalog/ui.json), one module per language (scripts/vite-i18n.ts). The root layout's load names the ones a page speaks
 * (English always, as the fallback) and loads them before the page renders, on the server and again in the browser,
 * where each is a hashed file kept for good; another is loaded when first needed. Every language holds the same strings
 * for everyone, so the server keeps one copy.
 */
type Dict = Record<string, string>;
const dicts = $state<Partial<Record<AppLang, Dict>>>({});
const pending = new Map<string, Promise<void>>();

export function loadLang(lang: string): Promise<void> {
	const l = isAppLang(lang) ? lang : "en";
	if (dicts[l]) return Promise.resolve();
	let p = pending.get(l);
	if (!p) {
		p = loaders[l]().then((m) => {
			dicts[l] = m.default;
		});
		// A failed download (the network) is tried again the next time the language is needed.
		p.catch(() => pending.delete(l));
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
