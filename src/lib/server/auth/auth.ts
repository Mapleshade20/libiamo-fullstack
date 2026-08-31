import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { base } from "$app/paths";
import { getRequestEvent } from "$app/server";
import { env } from "$env/dynamic/private";
import { emailVerificationHtml, resetPasswordHtml, sendEmail } from "$lib/server/auth/email";
import { db } from "$lib/server/db";

export const auth = betterAuth({
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
	database: drizzleAdapter(db, { provider: "pg" }),
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
			urlObj.searchParams.set("callbackURL", `${base}/verify?success=1`);
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
		additionalFields: {
			role: { type: "string", defaultValue: "learner", input: false },
			activeLanguage: { type: "string", required: true, input: true },
			nativeLanguage: { type: "string", required: false, input: true },
			feedbackLanguagePreference: { type: "string", defaultValue: "native", input: true },
			gemsBalance: { type: "number", defaultValue: 0, input: false },
			deletedAt: { type: "string", required: false, input: false },
		},
	},
	plugins: [
		sveltekitCookies(getRequestEvent), // must be last
	],
});
