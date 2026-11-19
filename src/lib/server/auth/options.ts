import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { passwordProblem, WEAK_PASSWORD_CODE } from "#lib/auth/password-strength.ts";
import { OAUTH_EMAIL_NOT_VERIFIED, type SocialProviderId } from "#lib/auth/social.ts";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "#lib/constants.ts";
import {
	ADMIN_EMAILS,
	BETTER_AUTH_SECRET,
	GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	ORIGIN,
} from "$app/env/private";
import { clientIp, logAuthEvent } from "./audit.ts";
import { CAPTCHA_HEADER, CAPTCHA_PROTECTED_PATHS, captchaKeys, verifyCaptcha } from "./captcha.ts";
import { mails, send } from "./email.ts";

/** Better Auth endpoints that set a password, and the body field holding it. */
const PASSWORD_FIELDS: Record<string, string> = { "/sign-up/email": "password", "/reset-password": "newPassword", "/change-password": "newPassword" };

/** What the options need from the database, so tests can stand in for it. */
export interface AuthStore {
	/** Deletes one of a user's sign-in methods under a lock on the user, unless it is the last; false if it was not theirs. */
	unlinkAccount(userId: string, accountId: string): Promise<"deleted" | "missing" | "last">;
	/** Whether the user signs in with a password. */
	hasPassword(userId: string): Promise<boolean>;
	/** Makes the user an admin if their verified address is one of `emails`; true if that changed their role. */
	grantAdmin(userId: string, emails: readonly string[]): Promise<boolean>;
	/** Clears the address a change was waiting on, once it has happened. */
	clearPendingEmail(userId: string): Promise<void>;
}

const providers = (): Partial<Record<SocialProviderId, { clientId: string; clientSecret: string }>> => ({
	...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET ? { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } } : {}),
	...(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET ? { github: { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET } } : {}),
});
/** The providers this deployment has credentials for: the sign-in pages show only these. */
export const configuredProviders = () => Object.keys(providers()) as SocialProviderId[];

/**
 * Every Better Auth option except the database adapter and the SvelteKit cookie plugin, which only exist in the running
 * app; tests build the configuration the app ships from here.
 */
export function createAuthOptions(store: AuthStore) {
	const captcha = captchaKeys();
	// Pairs an address change's `before` with its `after`, which only then knows the user.
	const emailChanges = new WeakSet<object>();
	// Requests that created a user, so the provider account made with it is not logged as a link.
	const signUps = new WeakSet<object>();

	return {
		// Mounted at the default /api/auth.
		baseURL: ORIGIN,
		secret: BETTER_AUTH_SECRET,
		// No cookie cache: every request reads the session and the user, so a setting written by the app (finishing the
		// welcome, a granted role) is seen on the next request. One indexed lookup per request is cheap at this size.
		// A sign-in lasts twenty days from the last day it was used (Better Auth moves the expiry on once a day).
		session: { cookieCache: { enabled: false }, expiresIn: 60 * 60 * 24 * 20 },
		// A state that cannot be parsed (an OAuth round trip left until it expired) has nowhere to go but here.
		onAPIError: { errorURL: "/sign-in" },
		socialProviders: providers(),
		account: {
			encryptOAuthTokens: true,
			// Only relaxes links an authenticated session asked for; implicit linking at sign-in still needs both addresses
			// verified, since no provider is trusted.
			accountLinking: { allowDifferentEmails: true },
		},
		user: {
			// The new mailbox is verified before it replaces the old one, which signs in until then.
			changeEmail: { enabled: true, updateEmailWithoutVerification: false },
			// The learner's settings, written by the app's own commands; declared so the session carries them.
			additionalFields: {
				role: { type: "string", defaultValue: "learner", input: false },
				nativeLanguage: { type: "string", required: false, input: false },
				learningLanguages: { type: "string[]", required: false, input: false },
				activeLanguage: { type: "string", required: false, input: false },
				tutorLanguage: { type: "string", defaultValue: "native", input: false },
				weeklyGoal: { type: "number", defaultValue: 3, input: false },
				timeZone: { type: "string", required: false, input: false },
				helpImprove: { type: "boolean", defaultValue: true, input: false },
				theme: { type: "string", defaultValue: "system", input: false },
				backdrop: { type: "string", defaultValue: "none", input: false },
				pattern: { type: "string", defaultValue: "blossom", input: false },
				detail: { type: "string", defaultValue: "needed", input: false },
				onboardedAt: { type: "date", required: false, input: false },
				pendingEmail: { type: "string", required: false, input: false },
			},
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			minPasswordLength: PASSWORD_MIN_LENGTH,
			maxPasswordLength: PASSWORD_MAX_LENGTH,
			resetPasswordTokenExpiresIn: 3600,
			// An address that already has an account gets the same answer as a new one; its mailbox hears why.
			onExistingUserSignUp: async ({ user }) => send(mails.alreadySignedUp(user.email)),
			// The same link sets a provider account's first password.
			sendResetPassword: async ({ user, url }) =>
				send((await store.hasPassword(user.id)) ? mails.resetPassword(user.email, url) : mails.firstPassword(user.email, url)),
			onPasswordReset: async ({ user }, request) =>
				logAuthEvent("auth.password_reset", { userId: user.id, email: user.email, ip: clientIp(request?.headers) }),
		},
		emailVerification: {
			sendOnSignUp: true,
			sendOnSignIn: true,
			autoSignInAfterVerification: true,
			expiresIn: 3600,
			// The callers name where the link returns (/verify?done, or /settings?emailChanged for a new address); a link that
			// no longer works returns there with `error`. Signing in names none (a callbackURL there would send the page to
			// it), so Better Auth's "/" becomes the inbox page here.
			sendVerificationEmail: async ({ user, url }) => {
				const link = new URL(url);
				const back = link.searchParams.get("callbackURL") ?? "/";
				if (back === "/") link.searchParams.set("callbackURL", "/verify?done");
				send(back.startsWith("/settings") ? mails.changeEmail(user.email, link.href) : mails.verify(user.email, link.href));
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				// Only the settings command may request this: it verifies the password (or a fresh passwordless
				// session) first. Better Auth's public endpoint otherwise accepts any valid, even old, session.
				if (ctx.path === "/change-email" && ctx.request)
					throw new APIError("FORBIDDEN", { code: "REAUTHENTICATION_REQUIRED", message: "Change your email from settings." });
				// A signed-in learner asking for the link that sets their first password has passed it already.
				const signedInLink = ctx.path === "/request-password-reset" && !!(await getSessionFromCtx(ctx).catch(() => null));
				if (captcha && ctx.request && CAPTCHA_PROTECTED_PATHS.includes(ctx.path) && !signedInLink) {
					const passed = await verifyCaptcha(captcha.secretKey, ctx.request.headers.get(CAPTCHA_HEADER), clientIp(ctx.request.headers));
					if (!passed) throw new APIError("FORBIDDEN", { code: "CAPTCHA_FAILED", message: "auCaptchaFailed" });
				}
				// Every way to set a password passes here, so the strength rule holds for direct calls too. Before Better
				// Auth's own checks, so an over-long input is refused without scoring it.
				const field = PASSWORD_FIELDS[ctx.path];
				if (field) {
					const value: unknown = ctx.body?.[field];
					const inputs = [ctx.body?.email, ctx.context.session?.user.email].filter((s): s is string => typeof s === "string");
					const problem = typeof value === "string" ? await passwordProblem(value, inputs) : null;
					if (problem) throw new APIError("BAD_REQUEST", { code: WEAK_PASSWORD_CODE, message: problem });
				}
			}),
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== "/change-password") return;
				const returned = ctx.context.returned as { user?: { id: string; email: string } } | undefined;
				if (returned?.user)
					logAuthEvent("auth.password_changed", { userId: returned.user.id, email: returned.user.email, ip: clientIp(ctx.request?.headers) });
			}),
		},
		databaseHooks: {
			user: {
				create: {
					// A provider's address is proof only if the provider verified it.
					before: async (user, ctx) => {
						if (ctx?.path?.startsWith("/callback/") && user.emailVerified !== true) {
							throw new APIError("BAD_REQUEST", { code: "OAUTH_EMAIL_NOT_VERIFIED", message: OAUTH_EMAIL_NOT_VERIFIED });
						}
					},
					after: async (user, ctx) => {
						if (ctx) signUps.add(ctx);
						const method = ctx?.path?.startsWith("/callback/") ? String(ctx.params?.id ?? "oauth") : "email";
						logAuthEvent("auth.sign_up", { userId: user.id, email: user.email, method, ip: clientIp(ctx?.request?.headers ?? ctx?.headers) });
					},
				},
				update: {
					before: async (data, ctx) => {
						if (ctx && typeof data.email === "string") emailChanges.add(ctx);
					},
					after: async (user, ctx) => {
						if (!ctx || !emailChanges.has(ctx)) return;
						emailChanges.delete(ctx);
						await store.clearPendingEmail(user.id);
						logAuthEvent("auth.email_changed", { userId: user.id, email: user.email, ip: clientIp(ctx.request?.headers ?? ctx.headers) });
					},
				},
			},
			session: {
				create: {
					// A fresh database needs no SQL to have an admin: a verified address on the list becomes one at sign-in.
					after: async (session) => {
						if (ADMIN_EMAILS.length && (await store.grantAdmin(session.userId, ADMIN_EMAILS)))
							logAuthEvent("auth.admin_granted", { userId: session.userId });
					},
				},
			},
			account: {
				create: {
					after: async (account, ctx) => {
						// A password row comes from a reset, which logs itself; a provider row made with the user is the sign-up.
						if (account.providerId === "credential" || !ctx || signUps.has(ctx)) return;
						logAuthEvent("auth.account_linked", {
							userId: account.userId,
							provider: account.providerId,
							ip: clientIp(ctx.request?.headers ?? ctx.headers),
						});
					},
				},
				delete: {
					// Better Auth deletes every account row of a deleted user too; only an unlink is guarded. The guard deletes
					// the row itself, under a lock, and returns false so Better Auth's own delete never runs.
					before: async (account, ctx) => {
						if (ctx?.path !== "/unlink-account") return;
						const result = await store.unlinkAccount(account.userId, account.id);
						if (result === "missing") throw new APIError("BAD_REQUEST", { code: "ACCOUNT_NOT_FOUND", message: "Account not found" });
						if (result === "last")
							throw new APIError("BAD_REQUEST", { code: "FAILED_TO_UNLINK_LAST_ACCOUNT", message: "You cannot unlink your last login method" });
						logAuthEvent("auth.account_unlinked", {
							userId: account.userId,
							provider: account.providerId,
							ip: clientIp(ctx.request?.headers ?? ctx.headers),
						});
						return false;
					},
				},
			},
		},
	} satisfies BetterAuthOptions;
}
