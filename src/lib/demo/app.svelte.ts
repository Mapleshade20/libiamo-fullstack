import { APP_LANGS, type AppLang, endonym, isAppLang, LEARNABLE, langName, RTL_LANGS } from "#lib/constants.ts";
import { loadLang, t } from "#lib/i18n/index.svelte.ts";

/*
 * Everything the demo would load from the main app's server, kept on this device instead: the learner's settings,
 * what they wrote, their notebook, their week. Pages read `app` and call the actions below; at the merge these become
 * load data and form actions.
 */

/*
 * The tour's sandbox (lib/components/tour): while it plays, everything stored goes to memory instead, starting from the
 * tour's own stand-in data, and is thrown away when it ends, so nothing the learner has is read or touched. Only the
 * settings come through (the tour speaks their languages).
 */
let sandbox: Map<string, string> | null = null;
const THROUGH = new Set(["prefs", "sideFolded"]);
export function enterSandbox(seed: Record<string, unknown>) {
	sandbox = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
	app.touch();
}
export function leaveSandbox() {
	sandbox = null;
	app.touch();
}
export const sandboxed = () => sandbox !== null;
const raw = (key: string) => (sandbox ? (sandbox.get(key) ?? (THROUGH.has(key) ? localStorage.getItem(key) : null)) : localStorage.getItem(key));
const read = <T>(key: string, fallback: T): T => {
	try {
		const v = raw(key);
		return v === null ? fallback : (JSON.parse(v) as T);
	} catch {
		return fallback;
	}
};
const write = (key: string, v: unknown) => {
	if (sandbox) sandbox.set(key, JSON.stringify(v));
	else localStorage.setItem(key, JSON.stringify(v));
};
const forget = (key: string) => {
	if (sandbox) sandbox.delete(key);
	else localStorage.removeItem(key);
};

export type Feedback = "native" | "target";
export type Prefs = {
	native: AppLang;
	learning: string[];
	/** The language being worked in: the interface speaks it. */
	active: string;
	/** The tutor's language inside a session: the learner's own, or the one they write in. */
	feedback: Feedback;
	weeklyGoal: number;
	name: string;
	/** Stands in for the Gravatar picture of the account's address (the only picture there is; the demo has none); none
	    means their initial on a disc. */
	avatar?: string;
	helpImprove: boolean;
};

function loadPrefs(): Prefs {
	// Chinese is Simplified only: a Traditional-Chinese browser (zh-TW, zh-HK, zh-Hant) does not pick it by itself.
	const nav = (navigator.language || "en").toLowerCase();
	const browser =
		/^zh(-(cn|sg|hans))?\b/.test(nav) && !/hant|tw|hk|mo/.test(nav) ? "zh-CN" : (APP_LANGS.find((l) => nav.startsWith(l.toLowerCase())) ?? "en");
	// Prefs saved before Chinese became "zh-CN" still say "zh".
	const old = (l: unknown) => (l === "zh" ? "zh-CN" : l);
	const raw = read<Record<string, unknown>>("prefs", {});
	const p = {
		...raw,
		native: old(raw.native),
		active: old(raw.active),
		learning: Array.isArray(raw.learning) ? raw.learning.map(old) : raw.learning,
	} as Partial<Prefs>;
	const native = isAppLang(p.native) ? p.native : browser;
	let learning = (Array.isArray(p.learning) ? p.learning : []).filter((l) => (LEARNABLE as readonly string[]).includes(l) && l !== native);
	if (!learning.length) learning = [native === "en" ? "es" : "en"];
	return {
		native,
		learning,
		active: learning.includes(p.active ?? "") ? (p.active as string) : learning[0],
		feedback: p.feedback === "target" ? "target" : "native",
		weeklyGoal: [1, 2, 3, 4, 5, 6, 7].includes(p.weeklyGoal ?? 0) ? (p.weeklyGoal as number) : 3,
		name: typeof p.name === "string" && p.name.trim() ? p.name : "Maple",
		avatar: typeof p.avatar === "string" && p.avatar.startsWith("data:image/") ? p.avatar : undefined,
		helpImprove: p.helpImprove !== false,
	};
}

export type Theme = "system" | "light" | "dark";
export const THEMES: Theme[] = ["system", "light", "dark"];

class AppState {
	prefs = $state<Prefs>(loadPrefs());
	theme = $state<Theme>(THEMES.includes(localStorage.getItem("theme") as Theme) ? (localStorage.getItem("theme") as Theme) : "system");
	dark = $state(false);
	/** Bumped whenever something stored outside `prefs` changes (writing, notebook, week), so derived lists refresh. */
	version = $state(0);
	/** The interface language. */
	get lang() {
		return this.prefs.active;
	}
	/** The tutor's language. */
	get tutor() {
		return this.prefs.feedback === "native" ? this.prefs.native : this.prefs.active;
	}
	/** Sends the settings to the server; lib/account/account.svelte.ts sets it. */
	persist: (() => void) | null = null;
	save() {
		write("prefs", this.prefs);
		this.persist?.();
	}
	touch() {
		this.version++;
	}
}
export const app = new AppState();

/** The interface's string for a key, in the language being worked in. */
export const tx = (key: string, vars?: Record<string, string | number>) => t(app.lang, key, vars);
/** A language's name in the interface language. */
export const nameOf = (code: string) => langName(code, app.lang);
export { endonym };

/* ---------- Theme ---------- */
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
	app.dark = app.theme === "dark" || (app.theme === "system" && darkQuery.matches);
	document.documentElement.dataset.theme = app.dark ? "dark" : "light";
}
applyTheme();
darkQuery.addEventListener("change", applyTheme);
export function setTheme(c: Theme) {
	app.theme = c;
	localStorage.setItem("theme", c);
	applyTheme();
}

/* ---------- Language ---------- */
export function applyLang() {
	const l = app.lang;
	document.documentElement.lang = l === "zh-CN" ? "zh-Hans" : l;
	document.documentElement.dir = RTL_LANGS.includes(l) ? "rtl" : "ltr";
}
/** Load what the pages need to speak: the interface language, the tutor's, and English as the fallback. */
export const ready = () => Promise.all([loadLang("en"), loadLang(app.lang), loadLang(app.tutor)]);

/* Another tab changed something: follow it. */
addEventListener("storage", (e) => {
	if (e.key === "prefs") app.prefs = loadPrefs();
	else if (e.key === "theme") {
		app.theme = (e.newValue as Theme) ?? "system";
		applyTheme();
	} else app.touch();
});

/* ---------- Toast ---------- */
export const toastState = $state<{ msg: string; n: number }>({ msg: "", n: 0 });
export function toast(msg: string) {
	toastState.msg = msg;
	toastState.n++;
}
export const demoOpens = () => toast(tx("demoOpens"));

export { forget, read, write };

/** Work in another language: what is on the page changes language at once, over a backdrop that stays. */
export async function switchLanguage(l: string) {
	if (l === app.prefs.active) return;
	const { tick } = await import("svelte");
	await Promise.all([loadLang(l), app.prefs.feedback === "target" ? loadLang(l) : Promise.resolve()]);
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
