import { goto } from "$app/navigation";
import { APP_LANGS, type AppLang, isAppLang, RTL_LANGS } from "$lib/constants";
import { loadLang, t } from "$lib/i18n/index.svelte";
import { applyLang } from "./app.svelte";
import { needsWelcome, newAccount } from "./onboarding.svelte";

/*
 * Signing in, kept on this device (the main app's Better Auth, at the merge): one account, how it signs in, whether its
 * address is confirmed, and whether this browser is signed in. A browser that has never seen the pages is signed in as
 * the demo's learner, so nothing else in the demo changes; signing out (the account menu) shows the way back in.
 * Before signing in there is no learning language yet, so the pages speak the browser's language, or the one picked
 * in their corner, and the welcome starts from it.
 */
export type Via = "email" | "google" | "github";
export type Account = {
	email: string;
	via: Via;
	verified: boolean;
	name?: string;
	/** A provider's account has no password until one is set (by a mailed link). */
	hasPassword?: boolean;
	/** A new address waiting for its link; the old one signs in until then. */
	pendingEmail?: string;
	/**
	 * The learner's own AI key: every call runs on it, there is no trial (user, 2026-11-13). Which provider and model,
	 * never the key itself (the main app keeps it encrypted on the server). Null: none yet; a new account starts so.
	 * Accounts kept before keys were asked for have the demo's.
	 */
	key?: { provider: string; model: string } | null;
};

export const RECOMMENDED_KEY = { provider: "openrouter", model: "~anthropic/claude-haiku-latest" };
const DEMO: Account = { email: "maple@gmail.com", via: "email", verified: true, name: "Maple", hasPassword: true, key: RECOMMENDED_KEY };
const readAccount = (): Account => {
	try {
		const a = JSON.parse(localStorage.getItem("account") ?? "null");
		return a && typeof a.email === "string" ? { ...a, key: a.key === undefined ? RECOMMENDED_KEY : a.key } : DEMO;
	} catch {
		return DEMO;
	}
};

export const account = $state({ me: readAccount(), signedIn: localStorage.getItem("signedOut") !== "1" });
function keep() {
	localStorage.setItem("account", JSON.stringify(account.me));
	if (account.signedIn) localStorage.removeItem("signedOut");
	else localStorage.setItem("signedOut", "1");
}
addEventListener("storage", (e) => {
	if (e.key === "account") account.me = readAccount();
	if (e.key === "signedOut") account.signedIn = e.newValue !== "1";
});

/** The browser's interface language. Chinese is Simplified only: zh-TW, zh-HK and zh-Hant do not pick it. */
export function browserLang(): AppLang {
	const nav = (navigator.language || "en").toLowerCase();
	if (/^zh\b/.test(nav)) return /hant|tw|hk|mo/.test(nav) ? "en" : "zh-CN";
	return APP_LANGS.find((l) => nav.startsWith(l.toLowerCase())) ?? "en";
}
const picked = sessionStorage.getItem("authLang");
/**
 * The language of the pages before signing in, and the address typed on one of them, carried to the next (never in the
 * URL): from signing in to a forgotten password, from signing up to the inbox page.
 */
export const auth = $state<{ lang: AppLang; email: string }>({
	lang: isAppLang(picked) ? picked : browserLang(),
	email: sessionStorage.getItem("authEmail") ?? "",
});
/** A string of the pages before signing in. */
export const atx = (key: string, vars?: Record<string, string | number>) => t(auth.lang, key, vars);
export async function setAuthLang(l: AppLang) {
	auth.lang = l;
	sessionStorage.setItem("authLang", l);
	await loadLang(l);
	speak(l);
}
export function speak(l: string) {
	document.documentElement.lang = l === "zh-CN" ? "zh-Hans" : l;
	document.documentElement.dir = RTL_LANGS.includes(l) ? "rtl" : "ltr";
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A stand-in for the main app's zxcvbn check (lib/auth/password-strength.ts): the key of what is wrong, or null.
 * The server checks again; this only spares a round trip.
 */
export function weakPassword(pw: string, email: string): string | null {
	if (pw.length < 8) return "auPwShort";
	const local = email.split("@")[0].toLowerCase();
	const low = pw.toLowerCase();
	if (
		/^(.)\1+$/.test(pw) ||
		/^(0?123456789?0?|password\d*|qwerty\w*|abc123\w*|iloveyou|11111111)$/.test(low) ||
		(local.length > 3 && low.includes(local))
	)
		return "auPwGuessable";
	return null;
}

/* ---------- The flows ---------- */
// Into the app: the welcome for an account that has not set up, else home, speaking the language worked in.
export function enter() {
	if (needsWelcome()) return goto("/welcome", { replaceState: true });
	applyLang();
	return goto("/", { replaceState: true });
}

/** Signing in with an address and password. Wrong ones get one message, never which of the two was wrong. */
export function signIn(email: string, password: string): "ok" | "wrong" | "unverified" {
	if (!same(email, account.me.email) || !password) return "wrong";
	if (!account.me.verified) return "unverified";
	account.signedIn = true;
	keep();
	enter();
	return "ok";
}

/**
 * A new account by address: it waits for the address to be confirmed. An address that already has an account gets the
 * same page (the mail it receives says so), so the form never tells who is signed up.
 */
export function signUp(email: string) {
	if (!same(email, account.me.email)) {
		account.me = { email: email.trim(), via: "email", verified: false, hasPassword: true, key: null };
		newAccount();
	}
	account.signedIn = false;
	keep();
	auth.email = email.trim();
	goto("/verify");
}

/** The link in the confirmation mail: signed in, and on to setting up. */
export function confirmEmail() {
	account.me = { ...account.me, verified: true };
	account.signedIn = true;
	keep();
	enter();
}

/** Google or GitHub: the account it already belongs to, or a new one (with the name the provider gives). */
export async function continueWith(via: Exclude<Via, "email">) {
	await new Promise((r) => setTimeout(r, 900));
	if (account.me.via !== via) {
		account.me = {
			email: via === "google" ? "maple.reads@gmail.com" : "maple@users.noreply.github.com",
			via,
			verified: true,
			name: "Maple",
			key: null,
		};
		newAccount();
	}
	account.signedIn = true;
	keep();
	enter();
}

/* ---------- Settings: the address and the password ---------- */
/**
 * A new address is confirmed before it replaces the old one (a link to it); until then the old one signs in. An address
 * that already has an account gets the same answer (its mail says so), so the form never tells who is signed up.
 */
export function requestEmailChange(email: string) {
	account.me = { ...account.me, pendingEmail: email.trim() };
	keep();
}
/** The link in the new address's mail. */
export function confirmEmailChange() {
	if (!account.me.pendingEmail) return;
	account.me = { ...account.me, email: account.me.pendingEmail, pendingEmail: undefined };
	keep();
}
export function cancelEmailChange() {
	account.me = { ...account.me, pendingEmail: undefined };
	keep();
}
/** The link that sets a first password on a provider's account. */
export function passwordSet() {
	account.me = { ...account.me, hasPassword: true };
	keep();
}

export function signOut(to = "/sign-in") {
	account.signedIn = false;
	keep();
	goto(to);
}
/** Whether the account signs in with a password (accounts kept before the field existed: those made by address). */
/** Saving or removing the learner's key (the settings page and the welcome). */
export function setKey(key: Account["key"]) {
	account.me = { ...account.me, key };
	keep();
}
export const hasPassword = () => account.me.hasPassword ?? account.me.via === "email";
