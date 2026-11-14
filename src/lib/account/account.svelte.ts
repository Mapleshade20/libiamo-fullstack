import { captchaHeaders } from "#lib/auth/captcha.svelte.ts";
import { authClient } from "#lib/auth/client.ts";
import { passwordProblem } from "#lib/auth/password-strength.ts";
import type { SocialProviderId } from "#lib/auth/social.ts";
import { APP_LANGS, type AppLang, isAppLang, RTL_LANGS } from "#lib/constants.ts";
import { app, applyLang } from "#lib/demo/app.svelte.ts";
import { loadLang, t } from "#lib/i18n/index.svelte.ts";
import { goto } from "$app/navigation";
import {
	cancelEmailChange as cancelChange,
	finishWelcome as finish,
	me,
	requestEmailChange as requestChange,
	saveKey,
	savePrefs,
} from "./account.remote.ts";
import type { Me } from "./me.ts";

/*
 * The signed-in account in the browser: what the server says (`me`), the settings it holds poured into `app.prefs`
 * (which the pages read), and the flows of the auth pages through Better Auth. Before signing in there is no learning
 * language yet, so those pages speak the browser's language, or the one picked in their corner.
 */
export type { Me, Via } from "./me.ts";

export const RECOMMENDED_KEY = { provider: "openrouter", model: "~anthropic/claude-haiku-latest" };
const NOBODY: Me = {
	email: "",
	name: "",
	verified: false,
	via: "email",
	hasPassword: false,
	linked: [],
	key: null,
	role: "learner",
	onboarded: false,
	prefs: null,
};

export const account = $state<{ me: Me; signedIn: boolean }>({ me: NOBODY, signedIn: false });

function adopt(m: Me | null) {
	account.me = m ?? NOBODY;
	account.signedIn = !!m;
	if (m?.prefs) app.prefs = { ...app.prefs, ...m.prefs, name: m.name };
	else if (m) app.prefs = { ...app.prefs, name: m.name };
}
/** Asks the server who is signed in (on load, and after anything that may have changed it). */
export async function hydrate() {
	adopt(
		await me()
			.refresh()
			.then(() => me()),
	);
}

/* The settings live on the server once the welcome is done; `app.save()` sends them there. */
app.persist = () => {
	if (!account.signedIn || !account.me.onboarded) return;
	const p = app.prefs;
	void savePrefs({
		name: p.name,
		native: p.native,
		learning: p.learning as never,
		active: p.active as never,
		feedback: p.feedback,
		weeklyGoal: p.weeklyGoal,
		helpImprove: p.helpImprove,
	}).catch((e) => console.error("settings were not saved", e));
};

/** The welcome's end: the settings it chose, and the account is set up. */
export async function finishWelcome() {
	const p = app.prefs;
	await finish({
		name: p.name,
		native: p.native,
		learning: p.learning as never,
		active: p.active as never,
		feedback: p.feedback,
		weeklyGoal: p.weeklyGoal,
		helpImprove: p.helpImprove,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	});
	await hydrate();
}

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

/** What is wrong with a new password, as a catalog key, or null; the server asks again. */
export const weakPassword = (pw: string, email: string) => passwordProblem(pw, [email]);

/* ---------- The flows ---------- */
type Failure = { code?: string; message?: string; status?: number } | null | undefined;
/** The catalog key for a refusal the pages can name, else the generic one. */
const refusal = (e: Failure, fallback = "auSomethingWrong") =>
	e?.code === "WEAK_PASSWORD" && e.message ? e.message : e?.code === "CAPTCHA_FAILED" ? "auCaptchaFailed" : fallback;

/** Into the app: the welcome for an account that has not set up, else home, speaking the language worked in. */
export function enter() {
	if (!account.me.onboarded) return goto("/welcome", { replace: true });
	applyLang();
	return goto("/", { replace: true });
}

/** An address and password. Wrong ones get one message, never which of the two was wrong. */
export async function signIn(email: string, password: string): Promise<"ok" | "wrong" | "unverified" | string> {
	const { error } = await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/verify?done" }, { headers: captchaHeaders() });
	if (error?.code === "EMAIL_NOT_VERIFIED") return "unverified"; // Better Auth has sent the link again
	if (error?.code === "INVALID_EMAIL_OR_PASSWORD") return "wrong";
	if (error) return refusal(error);
	await hydrate();
	await enter();
	return "ok";
}

/**
 * A new account by address: it waits for the address to be confirmed. An address that already has an account gets the
 * same answer (the mail it receives says so), so the form never tells who is signed up. Null, or the refusal's key.
 */
export async function signUp(email: string, password: string): Promise<string | null> {
	const address = email.trim();
	const { error } = await authClient.signUp.email(
		{ email: address, password, name: address.slice(0, address.indexOf("@")) || address, callbackURL: "/verify?done" },
		{ headers: captchaHeaders() },
	);
	if (error) return refusal(error);
	auth.email = address;
	await goto("/verify");
	return null;
}

/** The link again, from the inbox page. */
export async function resendVerification(email: string): Promise<string | null> {
	const { error } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: "/verify?done" }, { headers: captchaHeaders() });
	return error ? refusal(error) : null;
}

/** Google or GitHub: the account it belongs to, or a new one. The page leaves for the provider. */
export async function continueWith(via: SocialProviderId) {
	await authClient.signIn.social({ provider: via, callbackURL: "/", newUserCallbackURL: "/welcome", errorCallbackURL: "/sign-in" });
}

/** A link to set a new password (or a provider account's first one); the same answer whether the address has an account. */
export async function requestPasswordReset(email: string): Promise<string | null> {
	const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/forgot-password" }, { headers: captchaHeaders() });
	return error ? refusal(error) : null;
}

/** The new password from the mailed link. Null, "expired", or the refusal's key. */
export async function resetPassword(token: string, password: string): Promise<string | null> {
	const { error } = await authClient.resetPassword({ token, newPassword: password }, { headers: captchaHeaders() });
	if (error?.code === "INVALID_TOKEN") return "expired";
	return error ? refusal(error) : null;
}

/** A new password from settings. Null, "acWrongPw", or the refusal's key. */
export async function changePassword(current: string, next: string, others: boolean): Promise<string | null> {
	const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: others });
	if (error?.code === "INVALID_PASSWORD") return "acWrongPw";
	return error ? refusal(error) : null;
}

/* ---------- Settings: the address and the key ---------- */
export const requestEmailChange = (email: string, password?: string) => requestChange({ email: email.trim(), password });
export async function cancelEmailChange() {
	await cancelChange();
	await hydrate();
}
/** Saves the learner's key (the settings page and the welcome); the server keeps it encrypted. */
export async function setKey(provider: string, model: string, key: string) {
	await saveKey({ provider: provider as never, model, key });
	await hydrate();
}
export const hasPassword = () => account.me.hasPassword;

/** Adds Google or GitHub as a way in; the page leaves for the provider and comes back to settings. */
export async function connect(provider: SocialProviderId) {
	await authClient.linkSocial({ provider, callbackURL: "/settings", errorCallbackURL: "/settings" });
}
/** Removes one; the last way in cannot go. Null, or the refusal's key. */
export async function disconnect(provider: SocialProviderId): Promise<string | null> {
	const link = account.me.linked.find((l) => l.provider === provider);
	if (!link) return null;
	const { error } = await authClient.unlinkAccount({ accountId: link.id });
	await hydrate();
	return error ? refusal(error) : null;
}

export async function signOut(to = "/sign-in") {
	await authClient.signOut();
	adopt(null);
	await goto(to);
}
