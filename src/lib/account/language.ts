import { toast } from "#lib/components/shell/toast.svelte.ts";
import { endonym } from "#lib/constants.ts";
import { loadLang } from "#lib/i18n/index.svelte.ts";
import { dirOf, htmlLang } from "#lib/i18n/langs.ts";
import { tx } from "#lib/i18n/tx.ts";
import { app } from "./app.svelte.ts";

/** <html lang dir> for the language worked in (the server renders them; this follows a change in the browser). */
export function applyLang() {
	document.documentElement.lang = htmlLang(app.lang);
	document.documentElement.dir = dirOf(app.lang);
}
/** Loads what the pages need to speak: the interface language, the tutor's, and English as the fallback. */
export const ready = () => Promise.all([loadLang("en"), loadLang(app.lang), loadLang(app.tutor)]);

/** Work in another language: what is on the page changes language at once, over a backdrop that stays. */
export async function switchLanguage(l: string) {
	if (l === app.prefs.active) return;
	const { tick } = await import("svelte");
	await loadLang(l);
	const apply = async () => {
		app.prefs.active = l;
		app.save();
		applyLang();
		await tick();
	};
	if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
		// layout.css names what moves for this trip only: the backdrop stays, what is on it fades over.
		document.documentElement.dataset.vt = "lang";
		await document.startViewTransition(apply).finished.finally(() => delete document.documentElement.dataset.vt);
	} else await apply();
	toast(tx("wsSwitched", { lang: endonym(l) }));
}
