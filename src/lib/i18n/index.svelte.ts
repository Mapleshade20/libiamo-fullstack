import { type AppLang, isAppLang } from "$lib/constants";

/*
 * The demo's interface strings: web/i18n/source.json (en and zh-CN by hand), translated into the other interface
 * languages by `pnpm i18n` (web/i18n/ui.json). A language is fetched when first needed; English always is, as the
 * fallback. `t(lang, key, vars)` is the main app's API.
 */
type Dict = Record<string, string>;
const dicts = $state<Partial<Record<AppLang, Dict>>>({});
const pending = new Map<string, Promise<void>>();

export function loadLang(lang: string): Promise<void> {
	const l = isAppLang(lang) ? lang : "en";
	if (dicts[l]) return Promise.resolve();
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
