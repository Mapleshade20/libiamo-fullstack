import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx, isAPIError } from "better-auth/api";
import { base } from "$app/paths";
import { isTrustedEmailDomain, UNTRUSTED_EMAIL_DOMAIN_MESSAGE } from "$lib/auth/email-domain";
import { checkPasswordStrength, WEAK_PASSWORD_CODE } from "$lib/auth/password-strength";
import { AUTH_PASSWORD_MAX_LENGTH, AUTH_PASSWORD_MIN_LENGTH } from "$lib/constants";
import { type AuthAccountStore, createAccountDeleteHook } from "$lib/server/auth/account-deletion";
import { clientIp, logAuthEvent } from "$lib/server/auth/audit";
import { CAPTCHA_FAILED_MESSAGE, CAPTCHA_HEADER, CAPTCHA_PROTECTED_PATHS, captchaConfig, verifyCaptcha } from "$lib/server/auth/captcha";
import { emailVerificationHtml, resetPasswordHtml, sendEmail } from "$lib/server/auth/email";
import { configuredSocialProviders, prepareOAuthUser } from "$lib/server/auth/social";

type Environment = Record<string, string | undefined>;

/** Better Auth endpoints that set a password, and the body field holding it. */
const PASSWORD_FIELDS = { "/sign-up/email": "password", "/reset-password": "newPassword", "/change-password": "newPassword" } as const;

export interface AuthDependencies {
	/** Backs the last-login-method guard; production locks the user row in Postgres. */
	accountStore: AuthAccountStore;
	/**
	 * Headers of the request being served, for audit lines from callbacks Better Auth hands no
	 * request (`onPasswordReset` when a form action calls `auth.api`).
	 */
	requestHeaders?: () => Headers | undefined;
}

/**
 * Every Better Auth option except the ones that can only exist in a running app
 * (the Drizzle adapter and the SvelteKit cookie plugin).
 *
 * Split out so tests can exercise the configuration the app actually ships —
 * notably the absence of `account.accountLinking.trustedProviders`, which is the
 * only thing standing between an unverified provider email and an existing
 * account. A test that re-declares these options in its own words cannot catch a
 * change to them.
 */
export function createAuthOptions(env: Environment, { accountStore, requestHeaders }: AuthDependencies) {
	const captcha = captchaConfig(env);
	// Pairs an email update's `before` with its `after`, which only then knows the user id.
	const pendingEmailChanges = new WeakMap<object, string>();
	// Requests that created a user, so the provider account created with it is not also a link.
	const signUps = new WeakSet<object>();
	const guardAccountDelete = createAccountDeleteHook(accountStore);

	return {
		// Better Auth derives its router prefix from `new URL(baseURL).pathname`, and
		// `withPath()` only appends the default "/api/auth" when baseURL has no path of
		// its own. Spelling the mount point out and pinning basePath to "/" keeps the
		// request matcher and the router in agreement for both root and sub-path
		// deploys; at the root this resolves to exactly the previous default.
		baseURL: `${env.ORIGIN}${base}/api/auth`,
		basePath: "/",
		advanced: {
			// No-op at the root; scopes cookies to the app when BASE_PATH is set.
			defaultCookieAttributes: { path: base || "/" },
		},
		secret: env.BETTER_AUTH_SECRET,
		session: {
			// Every request resolves the session in `hooks.server.ts`; the signed cache cookie spares
			// the database that lookup. `updateUser` rewrites the cookie, so session-visible user fields
			// must change through it; a direct DB write (role, say) shows up within `maxAge`.
			// Freshness-sensitive checks read `getAuthoritativeSessionFromCtx`, which bypasses the cache.
			cookieCache: { enabled: true, maxAge: 5 * 60 },
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				// Direct HTTP calls must carry a Turnstile pass. The app's own form actions call
				// `auth.api` without a request and verify the widget's token themselves, which also
				// lets signed-in flows (Profile's password setup) skip a challenge they cannot show.
				if (captcha && ctx.request && (CAPTCHA_PROTECTED_PATHS as readonly string[]).includes(ctx.path)) {
					const passed = await verifyCaptcha(captcha, ctx.request.headers.get(CAPTCHA_HEADER), clientIp(ctx.request.headers));
					if (!passed) throw new APIError("FORBIDDEN", { code: "CAPTCHA_FAILED", message: CAPTCHA_FAILED_MESSAGE });
				}
				// Every way to set a password passes through one of these, so the strength rule
				// holds for direct API calls too; the forms check first only to answer sooner.
				// This runs before Better Auth's own length and token checks, so the estimator
				// itself refuses over-long input rather than scoring it.
				const password = PASSWORD_FIELDS[ctx.path as keyof typeof PASSWORD_FIELDS];
				if (password) {
					const value: unknown = ctx.body?.[password];
					const userInputs = [ctx.body?.name, ctx.body?.email].filter((input): input is string => typeof input === "string");
					const strength = typeof value === "string" ? await checkPasswordStrength(value, userInputs) : null;
					if (strength && !strength.ok) throw new APIError("BAD_REQUEST", { code: WEAK_PASSWORD_CODE, message: strength.warning });
				}
				if (ctx.path !== "/change-email") return;
				// The built-in change-email endpoint checks authentication, not freshness.
				// Guard the API itself, not only the Profile action.
				const session = await getAuthoritativeSessionFromCtx(ctx);
				if (!session) throw new APIError("UNAUTHORIZED", { code: "UNAUTHORIZED", message: "Sign in first." });
				if (Date.now() - new Date(session.session.createdAt).getTime() >= 10 * 60 * 1000) {
					throw new APIError("FORBIDDEN", { code: "SESSION_NOT_FRESH", message: "Sign in again before changing your email." });
				}
				const newEmail: unknown = ctx.body?.newEmail;
				if (typeof newEmail !== "string" || !isTrustedEmailDomain(newEmail)) {
					throw new APIError("BAD_REQUEST", { code: "UNTRUSTED_EMAIL_DOMAIN", message: UNTRUSTED_EMAIL_DOMAIN_MESSAGE });
				}
				logAuthEvent(env, "auth.email_change_requested", {
					userId: session.user.id,
					from: session.user.email,
					to: newEmail.toLowerCase(),
					ip: clientIp(ctx.request?.headers ?? ctx.headers),
				});
			}),
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== "/change-password") return;
				const returned = ctx.context.returned as { user?: { id: string; email: string } } | undefined;
				if (!returned?.user || isAPIError(returned)) return;
				logAuthEvent(env, "auth.password_changed", {
					userId: returned.user.id,
					email: returned.user.email,
					ip: clientIp(ctx.request?.headers ?? ctx.headers),
				});
			}),
		},
		// `errorCallbackURL` travels inside the OAuth state, so a state that cannot be
		// parsed — the common case being one the user left sitting until it expired —
		// has nowhere to send them but this fallback. Without it they land on Better
		// Auth's own bare error page instead of ours.
		onAPIError: { errorURL: `${base}/sign-in` },
		socialProviders: configuredSocialProviders(env),
		account: {
			encryptOAuthTokens: true,
			accountLinking: {
				// Only relaxes linking that an authenticated session asked for, where the
				// user has already proved they hold both identities. Implicit linking on
				// sign-in never consults this: it finds the account by email in the first
				// place, and still requires `requireLocalEmailVerified` plus a
				// provider-verified address, since there `trustedProviders` stays empty.
				allowDifferentEmails: true,
			},
		},
		databaseHooks: {
			account: {
				create: {
					after: async (account, ctx) => {
						// A password row comes from a reset, which logs itself; a provider row in the
						// request that created the user is the sign-up.
						if (account.providerId === "credential" || !ctx || signUps.has(ctx)) return;
						logAuthEvent(env, "auth.account_linked", {
							userId: account.userId,
							provider: account.providerId,
							ip: clientIp(ctx.request?.headers ?? ctx.headers),
						});
					},
				},
				delete: {
					before: async (account, ctx) => {
						// On an unlink the guard deletes the row itself and returns false, so Better
						// Auth's own delete, and with it `delete.after`, never runs.
						const result = await guardAccountDelete(account, ctx);
						if (result === false && ctx) {
							logAuthEvent(env, "auth.account_unlinked", {
								userId: account.userId,
								provider: account.providerId,
								ip: clientIp(ctx.request?.headers ?? ctx.headers),
							});
						}
						return result;
					},
				},
			},
			user: {
				create: {
					// Every way in (email sign-up and Google/GitHub) creates the user here, so this is
					// the one place the domain rule cannot be bypassed.
					before: async (user) => {
						if (typeof user.email !== "string" || !isTrustedEmailDomain(user.email)) {
							throw new APIError("BAD_REQUEST", { code: "UNTRUSTED_EMAIL_DOMAIN", message: UNTRUSTED_EMAIL_DOMAIN_MESSAGE });
						}
						return prepareOAuthUser(user);
					},
					after: async (user, ctx) => {
						if (ctx) signUps.add(ctx);
						logAuthEvent(env, "auth.sign_up", {
							userId: user.id,
							email: user.email,
							// `ctx.path` is the route pattern (`/callback/:id`); the provider is its parameter.
							method: ctx?.path?.startsWith("/callback/") ? String(ctx.params?.id ?? "oauth") : "email",
							ip: clientIp(ctx?.request?.headers ?? ctx?.headers),
						});
					},
				},
				update: {
					before: async (data, ctx) => {
						if (ctx && typeof data.email === "string") pendingEmailChanges.set(ctx, data.email);
					},
					after: async (user, ctx) => {
						if (!ctx || !pendingEmailChanges.has(ctx)) return;
						pendingEmailChanges.delete(ctx);
						logAuthEvent(env, "auth.email_changed", { userId: user.id, email: user.email, ip: clientIp(ctx.request?.headers ?? ctx.headers) });
					},
				},
			},
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			resetPasswordTokenExpiresIn: 3600,
			minPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
			maxPasswordLength: AUTH_PASSWORD_MAX_LENGTH,
			sendResetPassword: async ({ user, url }) => {
				void sendEmail({
					to: user.email,
					subject: "Libiamo | Reset your password",
					text: `Click the link to reset your password: ${url}`,
					html: resetPasswordHtml(user.email, url),
				});
			},
			// Also how an account made through Google or GitHub first gets a password.
			onPasswordReset: async ({ user }, request) => {
				logAuthEvent(env, "auth.password_reset", { userId: user.id, email: user.email, ip: clientIp(request?.headers ?? requestHeaders?.()) });
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			sendOnSignIn: true, // send verification email on sign in if email not verified
			autoSignInAfterVerification: true,
			expiresIn: 3600,
			sendVerificationEmail: async ({ user, url }) => {
				const urlObj = new URL(url);
				const changingEmail = urlObj.searchParams.get("callbackURL") === `${base}/verify?emailChange=1`;
				urlObj.searchParams.set("callbackURL", `${base}/verify?success=1${changingEmail ? "&emailChange=1" : ""}`);
				urlObj.searchParams.set("errorURL", `${base}/verify`); // back to verify page when error
				void sendEmail({
					to: user.email,
					subject: "Libiamo | Verify your email address",
					text: `Click the link to verify your email: ${urlObj.toString()}`,
					html: emailVerificationHtml(user.email, urlObj.toString()),
				});
			},
		},
		user: {
			// Verify the new mailbox without requiring access to the old mailbox.
			// Better Auth keeps the current email until the verification succeeds.
			changeEmail: { enabled: true, updateEmailWithoutVerification: false },
			additionalFields: {
				role: { type: "string", defaultValue: "learner", input: false },
				activeLanguage: { type: "string", required: true, input: true },
				nativeLanguage: { type: "string", required: false, input: true },
				feedbackLanguagePreference: { type: "string", defaultValue: "native", input: true },
				gemsBalance: { type: "number", defaultValue: 0, input: false },
				deletedAt: { type: "string", required: false, input: false },
			},
		},
	} satisfies BetterAuthOptions;
}
