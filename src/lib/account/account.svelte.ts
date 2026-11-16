import { captchaHeaders } from "#lib/auth/captcha.svelte.ts";
import { authClient } from "#lib/auth/client.ts";
import { passwordProblem } from "#lib/auth/password-strength.ts";
import type { SocialProviderId } from "#lib/auth/social.ts";
import { keepCookie } from "#lib/client/cookie.ts";
import type { AppLang } from "#lib/constants.ts";
import { loadLang, t } from "#lib/i18n/index.svelte.ts";
import { dirOf, htmlLang } from "#lib/i18n/langs.ts";
import { learnerState } from "#lib/scope.ts";
import { goto } from "$app/navigation";
import {
	cancelEmailChange as cancelChange,
	finishWelcome as finish,
	me,
	deleteAccount as remove,
	requestEmailChange as requestChange,
	saveDecisionModel,
	saveKey,
} from "./account.remote.ts";
import { app, firstPrefs } from "./app.svelte.ts";
import { applyLang } from "./language.ts";
import type { Me } from "./me.ts";

/*
 * The signed-in account: what the server says (`me`, given to the root layout's load, asked again after anything that
 * may change it), the settings it holds poured into `app` (which the pages read), and the flows of the auth pages
 * through Better Auth. Before signing in there is no learning language yet, so those pages speak the browser's
 * language, or the one picked in their corner.
 */
export type { Me, Via } from "./me.ts";

const NOBODY: Me = {
	email: "",
	name: "",
	picture: null,
	verified: false,
	via: "email",
	hasPassword: false,
	linked: [],
	key: null,
	role: "learner",
	onboarded: false,
	look: { theme: "system", backdrop: "none", pattern: "blossom", detail: "needed" },
	prefs: null,
};

export const account = learnerState(() => {
	const a = $state<{ me: Me; signedIn: boolean }>({ me: NOBODY, signedIn: false });
	return a;
});

/** Takes in who is signed in: the root layout's load (on the server and in the browser), and every `hydrate()`. */
export function adopt(m: Me | null) {
	account.me = m ?? NOBODY;
	account.signedIn = !!m;
	app.onboarded = !!m?.onboarded;
	if (m) app.look = { ...m.look };
	if (m?.prefs) app.prefs = { ...m.prefs, name: m.name };
	else if (m) app.prefs = { ...firstPrefs(auth.lang), name: m.name };
}
/** Asks the server again who is signed in (after anything that may have changed it). */
export async function hydrate() {
	adopt(
		await me()
			.refresh()
			.then(() => me()),
	);
}

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

/**
 * The language of the pages before signing in (the browser's, or the one picked in their corner, kept in a cookie the
 * server reads), and the address typed on one of them, carried to the next (never in the URL): from signing in to a
 * forgotten password, from signing up to the inbox page.
 */
export const auth = learnerState(() => {
	const a = $state<{ lang: AppLang; email: string }>({ lang: "en", email: "" });
	return a;
});
/** A string of the pages before signing in. */
export const atx = (key: string, vars?: Record<string, string | number>) => t(auth.lang, key, vars);
export async function setAuthLang(l: AppLang) {
	await loadLang(l);
	auth.lang = l;
	keepCookie("lang", l);
	speak(l);
}
export function speak(l: string) {
	document.documentElement.lang = htmlLang(l);
	document.documentElement.dir = dirOf(l);
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
	if (!account.me.onboarded) return goto("/welcome", { replace: true, invalidateAll: true });
	applyLang();
	return goto("/", { replace: true, invalidateAll: true });
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
/**
 * Saves the learner's key (the settings page and the welcome); the server tries it, then keeps it encrypted. A key the
 * provider would not answer comes back as the catalog key saying why (and the provider's words, for `setKeyOther`).
 */
export async function setKey(provider: string, model: string, key: string) {
	const problem = await saveKey({ provider: provider as never, model, key });
	if (problem) return problem;
	await hydrate();
	return null;
}
/** Which model checks what the learner sends; applies at once. */
export async function setDecisionModel(model: string) {
	if (account.me.key) account.me.key.decision = model;
	await saveDecisionModel(model);
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

/** Deletes the account (the address typed to confirm it), and leaves for the sign-in page. */
export async function deleteAccount(email: string) {
	await remove({ email });
	await authClient.signOut().catch(() => {});
	adopt(null);
	await goto("/sign-in", { replace: true, invalidateAll: true });
}

export async function signOut(to = "/sign-in") {
	await authClient.signOut();
	adopt(null);
	await goto(to, { invalidateAll: true });
}
