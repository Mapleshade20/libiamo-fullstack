import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { env } from "$env/dynamic/private";
import { emailVerificationHtml, resetPasswordHtml, sendEmail } from "$lib/server/auth/email";
import { db } from "$lib/server/db";

export const auth = betterAuth({
	baseURL: env.ORIGIN,
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
			urlObj.searchParams.set("callbackURL", "/verify?success=1");
			urlObj.searchParams.set("errorURL", "/verify"); // back to verify page when error
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
			timezone: { type: "string", defaultValue: "UTC", input: true },
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
