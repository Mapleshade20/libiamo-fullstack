import { error } from "@sveltejs/kit";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
	APP_LANGS,
	type AppLang,
	BACKDROPS,
	type Backdrop,
	DETAILS,
	type Detail,
	KEY_PROVIDERS,
	type KeyProvider,
	LEARNABLE,
	PATTERN_NAMES,
	type PatternName,
	THEMES,
	type Theme,
	TUTOR_LANGUAGES,
} from "#lib/constants.ts";
import { PROVIDERS } from "#lib/llm/providers.ts";
import { gravatarOf } from "#lib/server/account/gravatar.ts";
import { encryptKey } from "#lib/server/account/key.ts";
import { checkKey } from "#lib/server/account/key-check.ts";
import { clientIp, logAuthEvent } from "#lib/server/auth/audit.ts";
import { auth } from "#lib/server/auth/auth.ts";
import { captchaKeys } from "#lib/server/auth/captcha.ts";
import { configuredProviders } from "#lib/server/auth/options.ts";
import { db } from "#lib/server/db/index.ts";
import { account, user, userKey } from "#lib/server/db/schema.ts";
import { learner } from "#lib/server/guard.ts";
import { setWeekGoal } from "#lib/server/week/days.ts";
import { week } from "#lib/week/week.remote.ts";
import { command, getRequestEvent, query } from "$app/server";
import type { Me } from "./me.ts";

/* The account as the pages see it, and the settings they change. */

/** The signed-in learner, or null. */
export const me = query(async (): Promise<Me | null> => {
	const u = getRequestEvent().locals.user;
	if (!u) return null;
	const [accounts, [key], picture] = await Promise.all([
		db
			.select({ id: account.id, providerId: account.providerId, createdAt: account.createdAt })
			.from(account)
			.where(eq(account.userId, u.id))
			.orderBy(asc(account.createdAt)),
		db.select({ provider: userKey.provider, model: userKey.model, decision: userKey.decisionModel }).from(userKey).where(eq(userKey.userId, u.id)),
		gravatarOf(u.email),
	]);
	const first = accounts[0]?.providerId;
	return {
		email: u.email,
		name: u.name,
		picture,
		verified: u.emailVerified,
		via: first === "google" || first === "github" ? first : "email",
		hasPassword: accounts.some((a) => a.providerId === "credential"),
		linked: accounts
			.filter((a) => a.providerId !== "credential")
			.map((a) => ({ id: a.id, provider: a.providerId, since: a.createdAt.toISOString() })),
		pendingEmail: u.pendingEmail ?? undefined,
		key: key ?? null,
		role: u.role === "admin" ? "admin" : "learner",
		onboarded: !!u.onboardedAt,
		prefs: u.onboardedAt
			? {
					native: u.nativeLanguage as AppLang,
					learning: u.learningLanguages ?? [],
					active: u.activeLanguage ?? "",
					feedback: u.tutorLanguage === "target" ? "target" : "native",
					weeklyGoal: u.weeklyGoal,
					helpImprove: u.helpImprove,
				}
			: null,
		look: {
			theme: u.theme as Theme,
			backdrop: u.backdrop as Backdrop,
			pattern: u.pattern as PatternName,
			detail: u.detail as Detail,
		},
	};
});

/** What the signed-out pages offer: the providers this deployment has, and Turnstile's site key if it is on. */
export const signInSetup = query(async () => ({ providers: configuredProviders(), captchaSiteKey: captchaKeys()?.siteKey ?? null }));

const timeZone = z
	.string()
	.max(64)
	.refine((tz) => {
		try {
			new Intl.DateTimeFormat("en", { timeZone: tz });
			return true;
		} catch {
			return false;
		}
	});

const Prefs = z
	.object({
		name: z.string().trim().min(1).max(80),
		native: z.enum(APP_LANGS),
		learning: z.array(z.enum(LEARNABLE)).min(1).max(LEARNABLE.length),
		active: z.enum(LEARNABLE),
		feedback: z.enum(TUTOR_LANGUAGES),
		weeklyGoal: z.number().int().min(1).max(7),
		helpImprove: z.boolean(),
		timeZone: timeZone.optional(),
	})
	.refine(
		(p) => p.learning.includes(p.active) && !p.learning.includes(p.native as (typeof LEARNABLE)[number]),
		"the active language is one of the learnt ones, and none is the native",
	);

const columns = (p: z.infer<typeof Prefs>) => ({
	name: p.name,
	nativeLanguage: p.native,
	learningLanguages: [...new Set(p.learning)],
	activeLanguage: p.active,
	tutorLanguage: p.feedback,
	weeklyGoal: p.weeklyGoal,
	helpImprove: p.helpImprove,
	...(p.timeZone ? { timeZone: p.timeZone } : {}),
});

/** Every setting at once (the pages keep them together); only for an account that has set up. */
export const savePrefs = command(Prefs, async (p) => {
	const u = learner();
	if (!u.onboardedAt) error(409, "Set up first.");
	await db.update(user).set(columns(p)).where(eq(user.id, u.id));
	// A new weekly aim holds from the week under way; the weeks before keep theirs.
	if (p.weeklyGoal !== u.weeklyGoal) {
		await setWeekGoal(u, p.weeklyGoal);
		await week().refresh();
	}
});

/** How the pages look (and how much pass 1 marks): any of it, at once. */
export const saveLook = command(
	z.object({
		theme: z.enum(THEMES).optional(),
		backdrop: z.enum(BACKDROPS).optional(),
		pattern: z.enum(PATTERN_NAMES).optional(),
		detail: z.enum(DETAILS).optional(),
	}),
	async (look) => {
		const u = learner();
		if (Object.values(look).some((v) => v !== undefined)) await db.update(user).set(look).where(eq(user.id, u.id));
	},
);

/** The welcome's end: the settings, and the account is set up. */
export const finishWelcome = command(Prefs, async (p) => {
	const u = learner();
	await db
		.update(user)
		.set({ ...columns(p), onboardedAt: sql`coalesce(${user.onboardedAt}, now())` })
		.where(eq(user.id, u.id));
});

/**
 * The learner's own key, encrypted; replacing it replaces the setup too. It is never sent back. It is tried first
 * (server/account/key-check.ts): a key the provider will not answer is not saved, and the page says why.
 */
export const saveKey = command(
	z.object({ provider: z.enum(KEY_PROVIDERS), model: z.string().trim().min(1).max(200), key: z.string().trim().min(8).max(1000) }),
	async ({ provider, model, key }) => {
		const u = learner();
		const check = await checkKey(provider, model, key);
		if (!check.ok) return { problem: check.problem, detail: check.detail };
		const row = { provider, model, encryptedKey: encryptKey(key) };
		await db
			.insert(userKey)
			.values({ userId: u.id, ...row })
			.onConflictDoUpdate({ target: userKey.userId, set: row });
		return null;
	},
);

/** Which model checks what the learner sends (the gate), among those their key's provider runs. */
export const saveDecisionModel = command(z.string().max(200), async (model) => {
	const u = learner();
	const [key] = await db.select({ provider: userKey.provider }).from(userKey).where(eq(userKey.userId, u.id));
	const models = key ? (PROVIDERS[key.provider as KeyProvider].decisions?.models ?? []) : [];
	if (!models.some((m) => m.id === model)) error(400, "Not a model your provider runs.");
	await db.update(userKey).set({ decisionModel: model }).where(eq(userKey.userId, u.id));
});

/**
 * A new sign-in address: the password says it is really them (an account without one needs a sign-in under ten minutes
 * old instead), then the new address gets a link and only opening it makes the change. Until then the old one signs in
 * and settings shows the change waiting. An address that already has an account gets the same answer.
 */
export const requestEmailChange = command(
	z.object({ email: z.email().max(254), password: z.string().max(200).optional() }),
	async ({ email, password }): Promise<"sent" | "wrongPassword" | "signInAgain"> => {
		const u = learner();
		const headers = getRequestEvent().request.headers;
		const [credential] = await db
			.select({ id: account.id })
			.from(account)
			.where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));
		if (credential) {
			const ok = await auth.api
				.verifyPassword({ body: { password: password ?? "" }, headers })
				.then(() => true)
				.catch(() => false);
			if (!ok) return "wrongPassword";
		} else {
			const session = getRequestEvent().locals.session;
			if (!session || Date.now() - new Date(session.createdAt).getTime() > 10 * 60 * 1000) return "signInAgain";
		}
		await auth.api.changeEmail({ body: { newEmail: email.toLowerCase(), callbackURL: "/settings?emailChanged" }, headers });
		await db.update(user).set({ pendingEmail: email.toLowerCase() }).where(eq(user.id, u.id));
		return "sent";
	},
);

/** Forgets the waiting address (its link still works until it expires, as the mail says). */
export const cancelEmailChange = command(async () => {
	const u = learner();
	await db.update(user).set({ pendingEmail: null }).where(eq(user.id, u.id));
});

/**
 * Deletes the account and everything that belongs to it, once the learner has typed their address (the page refuses a
 * pasted one; the server only checks it matches). Its sessions go with it, so the browser is signed out.
 */
export const deleteAccount = command(z.object({ email: z.string().max(254) }), async ({ email }) => {
	const u = learner();
	if (email.trim().toLowerCase() !== u.email.toLowerCase()) error(400, "The address does not match.");
	await db.delete(user).where(eq(user.id, u.id));
	logAuthEvent("auth.account_deleted", { userId: u.id, email: u.email, ip: clientIp(getRequestEvent().request.headers) });
});
