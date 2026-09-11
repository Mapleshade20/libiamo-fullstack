import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { base } from "$app/paths";
import { type AuthAccountStore, createAccountDeleteHook } from "$lib/server/auth/account-deletion";
import { emailVerificationHtml, resetPasswordHtml, sendEmail } from "$lib/server/auth/email";
import { configuredSocialProviders, prepareOAuthUser } from "$lib/server/auth/social";

type Environment = Record<string, string | undefined>;

export interface AuthDependencies {
	/** Backs the last-login-method guard; production locks the user row in Postgres. */
	accountStore: AuthAccountStore;
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
export function createAuthOptions(env: Environment, { accountStore }: AuthDependencies) {
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
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== "/change-email") return;
				// The built-in change-email endpoint checks authentication, not freshness.
				// Guard the API itself, not only the Profile action.
				const session = await getAuthoritativeSessionFromCtx(ctx);
				if (!session) throw new APIError("UNAUTHORIZED", { code: "UNAUTHORIZED", message: "Sign in first." });
				if (Date.now() - new Date(session.session.createdAt).getTime() >= 10 * 60 * 1000) {
					throw new APIError("FORBIDDEN", { code: "SESSION_NOT_FRESH", message: "Sign in again before changing your email." });
				}
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
				delete: {
					before: createAccountDeleteHook(accountStore),
				},
			},
			user: {
				create: {
					before: prepareOAuthUser,
				},
			},
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			resetPasswordTokenExpiresIn: 3600,
			minPasswordLength: 8,
			sendResetPassword: async ({ user, url }) => {
				void sendEmail({
					to: user.email,
					subject: "Libiamo | Reset your password",
					text: `Click the link to reset your password: ${url}`,
					html: resetPasswordHtml(user.email, url),
				});
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
