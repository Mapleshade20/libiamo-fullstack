import { convertSetCookieToCookie, getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { socialAuthErrorMessage, socialAuthFailure } from "$lib/auth/social";
import type { AuthAccountStore, LockedAuthAccountTransaction } from "$lib/server/auth/account-deletion";
import { createAuthOptions } from "$lib/server/auth/options";
import { mapOAuthProfileToUser } from "$lib/server/auth/social";

const AUTH_BASE_URL = "http://localhost:3000/api/auth";
const APP_URL = "http://localhost:3000";

const { sentMail, zxcvbnCalls } = vi.hoisted(() => ({ sentMail: vi.fn(), zxcvbnCalls: vi.fn() }));
vi.mock("zxcvbn-typescript", async (importOriginal) => {
	const actual = await importOriginal<typeof import("zxcvbn-typescript")>();
	return {
		...actual,
		zxcvbn: (...args: Parameters<typeof actual.zxcvbn>) => {
			zxcvbnCalls(...args);
			return actual.zxcvbn(...args);
		},
	};
});
vi.mock("$lib/server/auth/email", () => ({
	sendEmail: sentMail,
	emailVerificationHtml: (_email: string, url: string) => url,
	resetPasswordHtml: (_email: string, url: string) => url,
}));

/** Set by `createAuthTestInstance`; the default account store reads through it. */
let testInstanceDb: any;

type GithubIdentity = {
	id: string;
	email: string;
	verified: boolean;
};

function mockGithub(identity: GithubIdentity) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string | URL | Request) => {
			const url = input instanceof Request ? input.url : input.toString();

			if (url === "https://github.com/login/oauth/access_token") {
				return Response.json({ access_token: "github-access-token", token_type: "bearer", scope: "user:email" });
			}

			if (url === "https://api.github.com/user") {
				return Response.json({
					id: identity.id,
					login: "libiamo-test-user",
					name: "Libiamo Test User",
					email: null,
					avatar_url: "https://avatars.githubusercontent.com/u/1",
				});
			}

			if (url === "https://api.github.com/user/emails") {
				return Response.json([
					{
						email: identity.email,
						primary: true,
						verified: identity.verified,
						visibility: "private",
					},
				]);
			}

			throw new Error(`Unexpected external request: ${url}`);
		}),
	);
}

function mockGoogle() {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string | URL | Request) => {
			const url = input instanceof Request ? input.url : input.toString();
			if (url === "https://oauth2.googleapis.com/token") {
				return Response.json({ access_token: "google-access-token", token_type: "Bearer", expires_in: 3600 });
			}
			throw new Error(`Unexpected external request: ${url}`);
		}),
	);
}

const TEST_ENV = {
	ORIGIN: APP_URL,
	BETTER_AUTH_SECRET: "test-secret-value-for-better-auth-instance",
	GOOGLE_CLIENT_ID: "google-client-id",
	GOOGLE_CLIENT_SECRET: "google-client-secret",
	GITHUB_CLIENT_ID: "github-client-id",
	GITHUB_CLIENT_SECRET: "github-client-secret",
};

/**
 * Builds the instance from the options the app actually ships, so this file
 * exercises the production configuration rather than a second copy of it — the
 * security of these flows rests on options that are absent from it (there is no
 * `account.accountLinking.trustedProviders`, so a provider must have verified the
 * address before Better Auth will attach it to an existing user).
 *
 * Only what cannot exist outside a running app is substituted: the account store
 * behind the unlink guard, and Google's `getUserInfo`, which would otherwise need
 * a signed id_token. The GitHub provider runs unmodified against a stubbed fetch.
 */
async function createAuthTestInstance(
	googleIdentity: GithubIdentity = { id: "google-user", email: "google@gmail.com", verified: true },
	accountStore: AuthAccountStore = createTestAccountStore(() => testInstanceDb),
	overrides: {
		deleteUser?: boolean;
		onResetPasswordToken?: (token: string) => void;
		env?: Record<string, string>;
		requestHeaders?: () => Headers | undefined;
	} = {},
) {
	const options = createAuthOptions({ ...TEST_ENV, ...overrides.env }, { accountStore, requestHeaders: overrides.requestHeaders });
	const google = options.socialProviders.google;
	if (!google || typeof google === "function") throw new Error("TEST_ENV should configure Google as a static provider");

	const instance = await getTestInstance(
		{
			...options,
			socialProviders: {
				...options.socialProviders,
				google: {
					...google,
					getUserInfo: async () => {
						const additionalUser = await mapOAuthProfileToUser();
						return {
							user: {
								id: googleIdentity.id,
								name: "Libiamo Test User",
								email: googleIdentity.email,
								emailVerified: googleIdentity.verified,
								...additionalUser,
							},
							data: null,
						};
					},
				},
			},
			user: {
				...options.user,
				deleteUser: { enabled: overrides.deleteUser === true },
			},
			emailAndPassword: {
				...options.emailAndPassword,
				// The production callback hands the token to SMTP; capture it instead.
				sendResetPassword: async ({ token }) => overrides.onResetPasswordToken?.(token),
			},
		},
		{ disableTestUser: true },
	);

	testInstanceDb = instance.db;
	return instance;
}

async function startSocialFlow(
	auth: Awaited<ReturnType<typeof createAuthTestInstance>>["auth"],
	provider: "github" | "google",
	options: { activeLanguage?: string } = {},
) {
	const response = await auth.handler(
		new Request(`${AUTH_BASE_URL}/sign-in/social`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: APP_URL,
			},
			body: JSON.stringify({
				provider,
				callbackURL: APP_URL,
				errorCallbackURL: `${APP_URL}/sign-in`,
				disableRedirect: true,
				additionalData: options.activeLanguage ? { activeLanguage: options.activeLanguage } : undefined,
			}),
		}),
	);

	expect(response.status).toBe(200);
	const body = (await response.json()) as { url: string };
	const state = new URL(body.url).searchParams.get("state");
	expect(state).toBeTruthy();

	return {
		state: state as string,
		headers: convertSetCookieToCookie(new Headers(response.headers)),
	};
}

async function finishSocialFlow(
	auth: Awaited<ReturnType<typeof createAuthTestInstance>>["auth"],
	provider: "github" | "google",
	flow: Awaited<ReturnType<typeof startSocialFlow>>,
) {
	return auth.handler(
		new Request(`${AUTH_BASE_URL}/callback/${provider}?code=provider-code&state=${encodeURIComponent(flow.state)}`, {
			headers: flow.headers,
		}),
	);
}

async function startSocialLink(
	auth: Awaited<ReturnType<typeof createAuthTestInstance>>["auth"],
	provider: "github" | "google",
	sessionHeaders: Headers,
) {
	const requestHeaders = new Headers(sessionHeaders);
	requestHeaders.set("content-type", "application/json");
	requestHeaders.set("origin", APP_URL);
	const response = await auth.handler(
		new Request(`${AUTH_BASE_URL}/link-social`, {
			method: "POST",
			headers: requestHeaders,
			body: JSON.stringify({
				provider,
				callbackURL: `${APP_URL}/profile`,
				errorCallbackURL: `${APP_URL}/profile`,
				disableRedirect: true,
			}),
		}),
	);
	expect(response.status).toBe(200);
	const body = (await response.json()) as { url: string };
	const state = new URL(body.url).searchParams.get("state");
	expect(state).toBeTruthy();

	const stateHeaders = convertSetCookieToCookie(new Headers(response.headers));
	const callbackHeaders = new Headers(sessionHeaders);
	callbackHeaders.set("cookie", `${sessionHeaders.get("cookie")}; ${stateHeaders.get("cookie")}`);
	return { state: state as string, headers: callbackHeaders };
}

function createTestAccountTransaction(getDb: () => any): LockedAuthAccountTransaction {
	return {
		listAccountIds: async (ownerId) => {
			const accounts = await getDb().findMany({ model: "account", where: [{ field: "userId", value: ownerId }] });
			return accounts.map(({ id }: { id: string }) => id);
		},
		deleteAccount: async (ownerId, accountId) => {
			const account = await getDb().findOne({
				model: "account",
				where: [
					{ field: "userId", value: ownerId },
					{ field: "id", value: accountId },
				],
			});
			if (!account) return false;
			await getDb().delete({ model: "account", where: [{ field: "id", value: accountId }] });
			return true;
		},
	};
}

/** The store's reads and writes without any locking, for tests that are not about concurrency. */
function createTestAccountStore(getDb: () => any): AuthAccountStore {
	return { withUserLock: (_userId, operation) => operation(createTestAccountTransaction(getDb)) };
}

function createControlledTestAccountStore(getDb: () => any): AuthAccountStore {
	let arrivals = 0;
	let releaseBarrier = () => {};
	const barrier = new Promise<void>((resolve) => {
		releaseBarrier = resolve;
	});
	const tails = new Map<string, Promise<void>>();

	return {
		withUserLock: async (userId, operation) => {
			arrivals += 1;
			if (arrivals === 2) releaseBarrier();
			await barrier;

			const previous = tails.get(userId) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			tails.set(
				userId,
				previous.then(() => current),
			);
			await previous;

			try {
				return await operation(createTestAccountTransaction(getDb));
			} finally {
				release();
			}
		},
	};
}

describe("Better Auth social authentication lifecycle", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("creates a passwordless account from a verified GitHub identity and keeps the selected language", async () => {
		const { auth, db } = await createAuthTestInstance();
		mockGithub({ id: "github-new-user", email: "new@gmail.com", verified: true });

		const flow = await startSocialFlow(auth, "github", { activeLanguage: "fr" });
		const callback = await finishSocialFlow(auth, "github", flow);

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe(APP_URL);

		const user = await db.findOne<{ id: string; activeLanguage: string; emailVerified: boolean }>({
			model: "user",
			where: [{ field: "email", value: "new@gmail.com" }],
		});
		expect(user).toMatchObject({ activeLanguage: "fr", emailVerified: true });
		if (!user) throw new Error("Expected the GitHub user to be created");

		const accounts = await db.findMany<{ providerId: string; accessToken: string }>({
			model: "account",
			where: [{ field: "userId", value: user.id }],
		});
		expect(accounts.map((account) => account.providerId)).toEqual(["github"]);
		expect(accounts[0]?.accessToken).not.toBe("github-access-token");

		const returningFlow = await startSocialFlow(auth, "github");
		const returningCallback = await finishSocialFlow(auth, "github", returningFlow);
		expect(returningCallback.status, await returningCallback.clone().text()).toBe(302);
		await expect(db.findMany({ model: "user", where: [{ field: "email", value: "new@gmail.com" }] })).resolves.toHaveLength(1);

		const sessionHeaders = convertSetCookieToCookie(new Headers(returningCallback.headers));
		await expect(auth.api.unlinkAccount({ body: { providerId: "github" }, headers: sessionHeaders })).rejects.toMatchObject({
			body: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" },
		});
	});

	it("creates a passwordless account from a verified Google identity", async () => {
		const { auth, db } = await createAuthTestInstance({
			id: "google-new-user",
			email: "google-new@gmail.com",
			verified: true,
		});
		mockGoogle();

		const flow = await startSocialFlow(auth, "google", { activeLanguage: "ja" });
		const callback = await finishSocialFlow(auth, "google", flow);

		expect(callback.status, await callback.clone().text()).toBe(302);
		const user = await db.findOne<{ id: string; activeLanguage: string; emailVerified: boolean }>({
			model: "user",
			where: [{ field: "email", value: "google-new@gmail.com" }],
		});
		expect(user).toMatchObject({ activeLanguage: "ja", emailVerified: true });
		if (!user) throw new Error("Expected the Google user to be created");
		await expect(db.findMany({ model: "account", where: [{ field: "userId", value: user.id }] })).resolves.toHaveLength(1);

		const returningFlow = await startSocialFlow(auth, "google");
		const returningCallback = await finishSocialFlow(auth, "google", returningFlow);
		expect(returningCallback.status, await returningCallback.clone().text()).toBe(302);
		await expect(db.findMany({ model: "user", where: [{ field: "email", value: "google-new@gmail.com" }] })).resolves.toHaveLength(1);
	});

	it("links a verified GitHub identity to an existing verified account with the same email", async () => {
		const { auth, db } = await createAuthTestInstance();
		const signup = await auth.api.signUpEmail({
			body: {
				name: "Existing User",
				email: "existing@gmail.com",
				password: "correct-horse-battery-staple",
				activeLanguage: "es",
			},
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: signup.user.id }],
			update: { emailVerified: true },
		});
		mockGithub({ id: "github-existing-user", email: "existing@gmail.com", verified: true });

		const flow = await startSocialFlow(auth, "github");
		const callback = await finishSocialFlow(auth, "github", flow);

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe(APP_URL);

		const users = await db.findMany<{ id: string }>({
			model: "user",
			where: [{ field: "email", value: "existing@gmail.com" }],
		});
		expect(users).toHaveLength(1);
		expect(users[0]?.id).toBe(signup.user.id);

		const accounts = await db.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: signup.user.id }],
		});
		expect(accounts.map((account) => account.providerId).sort()).toEqual(["credential", "github"]);
	});

	it("connects and disconnects GitHub through Better Auth account management", async () => {
		const { auth, db, signInWithUser } = await createAuthTestInstance();
		const password = "correct-horse-battery-staple";
		const signup = await auth.api.signUpEmail({
			body: {
				name: "Profile User",
				email: "profile@gmail.com",
				password,
				activeLanguage: "fr",
			},
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: signup.user.id }],
			update: { emailVerified: true },
		});
		const { headers: sessionHeaders } = await signInWithUser("profile@gmail.com", password);
		mockGithub({ id: "github-profile-user", email: "profile@gmail.com", verified: true });

		const flow = await startSocialLink(auth, "github", sessionHeaders);
		const callback = await finishSocialFlow(auth, "github", flow);
		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe(`${APP_URL}/profile`);
		await expect(db.findMany({ model: "account", where: [{ field: "userId", value: signup.user.id }] })).resolves.toHaveLength(2);

		await expect(auth.api.unlinkAccount({ body: { providerId: "github" }, headers: sessionHeaders })).resolves.toEqual({ status: true });
		const remainingAccounts = await db.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: signup.user.id }],
		});
		expect(remainingAccounts.map((account) => account.providerId)).toEqual(["credential"]);
	});

	it("serializes concurrent direct unlink requests so one login method remains", async () => {
		const instance = await createAuthTestInstance(
			{ id: "google-concurrent-user", email: "concurrent@gmail.com", verified: true },
			createControlledTestAccountStore(() => testInstanceDb),
		);
		const { auth, db } = instance;
		mockGithub({ id: "github-concurrent-user", email: "concurrent@gmail.com", verified: true });

		const signupFlow = await startSocialFlow(auth, "github", { activeLanguage: "es" });
		const signupCallback = await finishSocialFlow(auth, "github", signupFlow);
		const callbackCookies = convertSetCookieToCookie(new Headers(signupCallback.headers));
		const sessionCookie = callbackCookies
			.get("cookie")
			?.split("; ")
			.find((cookie) => cookie.startsWith("better-auth.session_token="));
		expect(sessionCookie).toBeTruthy();
		const sessionHeaders = new Headers({ cookie: sessionCookie as string });

		mockGoogle();
		const linkFlow = await startSocialLink(auth, "google", sessionHeaders);
		const linkCallback = await finishSocialFlow(auth, "google", linkFlow);
		expect(linkCallback.status).toBe(302);

		const results = await Promise.allSettled([
			auth.api.unlinkAccount({ body: { providerId: "github" }, headers: sessionHeaders }),
			auth.api.unlinkAccount({ body: { providerId: "google" }, headers: sessionHeaders }),
		]);

		expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
		const rejected = results.find(({ status }) => status === "rejected");
		expect(rejected).toMatchObject({
			status: "rejected",
			reason: { body: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" } },
		});

		const user = await db.findOne<{ id: string }>({ model: "user", where: [{ field: "email", value: "concurrent@gmail.com" }] });
		expect(user).not.toBeNull();
		if (!user) throw new Error("Expected the concurrent unlink user to exist");
		const remainingAccounts = await db.findMany({ model: "account", where: [{ field: "userId", value: user.id }] });
		expect(remainingAccounts).toHaveLength(1);
	});

	// `deleteUser` bulk-deletes a user's accounts before the user row, firing the same
	// `account.delete.before` hook. A guard that does not distinguish the two endpoints
	// rejects the deletion of a user whose only login method is the one it is protecting.
	it("lets a user with a single login method delete their account", async () => {
		const instance = await createAuthTestInstance(
			{ id: "google-deleted-user", email: "deleted@gmail.com", verified: true },
			createTestAccountStore(() => testInstanceDb),
			{ deleteUser: true },
		);
		const { auth, db, signInWithUser } = instance;

		const password = "correct-horse-battery-staple";
		const signup = await auth.api.signUpEmail({
			body: { name: "Deleted User", email: "deleted@gmail.com", password, activeLanguage: "ja" },
		});
		await db.update({ model: "user", where: [{ field: "id", value: signup.user.id }], update: { emailVerified: true } });
		const { headers: sessionHeaders } = await signInWithUser("deleted@gmail.com", password);
		await expect(db.findMany({ model: "account", where: [{ field: "userId", value: signup.user.id }] })).resolves.toHaveLength(1);

		await expect(auth.api.deleteUser({ body: { password }, headers: sessionHeaders })).resolves.toMatchObject({ success: true });

		await expect(db.findMany({ model: "user", where: [{ field: "id", value: signup.user.id }] })).resolves.toHaveLength(0);
	});

	// Profile links a credential-less account at the reset flow as the way to add a
	// password; losing the provider account is otherwise losing the Libiamo account.
	// That only works because Better Auth creates the missing credential row itself.
	it("verifies a new primary email before changing password login and preserves OAuth identity", async () => {
		const { auth, db, signInWithUser } = await createAuthTestInstance();
		const password = "correct-horse-battery-staple";
		const signup = await auth.api.signUpEmail({ body: { name: "Email User", email: "old@gmail.com", password, activeLanguage: "fr" } });
		await db.update({ model: "user", where: [{ field: "id", value: signup.user.id }], update: { emailVerified: true } });
		const { headers } = await signInWithUser("old@gmail.com", password);
		mockGithub({ id: "email-change-github", email: "different@gmail.com", verified: true });
		await finishSocialFlow(auth, "github", await startSocialLink(auth, "github", headers));
		const accountsBefore = await db.findMany({ model: "account", where: [{ field: "userId", value: signup.user.id }] });
		sentMail.mockClear();
		await auth.api.changeEmail({ headers, body: { newEmail: "new@gmail.com", callbackURL: "/verify?emailChange=1" } });
		expect(sentMail).toHaveBeenCalledTimes(1);
		const mail = sentMail.mock.calls[0][0];
		expect(mail.to).toBe("new@gmail.com");
		const verification = new URL(mail.html);
		expect(verification.searchParams.get("callbackURL")).toBe("/verify?success=1&emailChange=1");
		expect(await db.findOne({ model: "user", where: [{ field: "id", value: signup.user.id }] })).toMatchObject({
			email: "old@gmail.com",
			emailVerified: true,
		});
		const token = verification.searchParams.get("token") as string;
		await auth.api.verifyEmail({ query: { token }, headers });
		expect(await db.findOne({ model: "user", where: [{ field: "id", value: signup.user.id }] })).toMatchObject({
			email: "new@gmail.com",
			emailVerified: true,
			activeLanguage: "fr",
		});
		expect(await db.findMany({ model: "account", where: [{ field: "userId", value: signup.user.id }] })).toEqual(accountsBefore);
		await expect(auth.api.signInEmail({ body: { email: "new@gmail.com", password } })).resolves.toMatchObject({ user: { id: signup.user.id } });
		await expect(auth.api.signInEmail({ body: { email: "old@gmail.com", password } })).rejects.toThrow();
		await expect(auth.api.verifyEmail({ query: { token } })).rejects.toThrow();
		expect((await finishSocialFlow(auth, "github", await startSocialFlow(auth, "github"))).status).toBe(302);
		expect(await db.findMany({ model: "user" })).toHaveLength(1);
	});

	it("rejects stale direct email-change calls and does not send mail for occupied addresses", async () => {
		const { auth, db, signInWithUser } = await createAuthTestInstance();
		const password = "correct-horse-battery-staple";
		for (const email of ["first@gmail.com", "occupied@gmail.com"]) {
			const signup = await auth.api.signUpEmail({ body: { name: "User", email, password, activeLanguage: "en" } });
			await db.update({ model: "user", where: [{ field: "id", value: signup.user.id }], update: { emailVerified: true } });
		}
		const { headers } = await signInWithUser("first@gmail.com", password);
		sentMail.mockClear();
		await expect(auth.api.changeEmail({ headers, body: { newEmail: "occupied@gmail.com" } })).resolves.toEqual({ status: true });
		expect(sentMail).not.toHaveBeenCalled();
		const session = await auth.api.getSession({ headers });
		if (!session) throw new Error("Expected an authenticated session");
		await db.update({
			model: "session",
			where: [{ field: "id", value: session.session.id }],
			update: { createdAt: new Date("2025-01-01T00:00:00Z") },
		});
		await expect(auth.api.changeEmail({ headers, body: { newEmail: "available@gmail.com" } })).rejects.toMatchObject({
			body: { code: "SESSION_NOT_FRESH" },
		});
		expect(sentMail).not.toHaveBeenCalled();
		await expect(auth.api.changeEmail({ body: { newEmail: "available@gmail.com" } })).rejects.toThrow();
	});

	it("lets an account created through GitHub add a password through the reset flow", async () => {
		let resetToken: string | undefined;
		const { auth, db } = await createAuthTestInstance(undefined, undefined, {
			onResetPasswordToken: (token) => {
				resetToken = token;
			},
		});
		mockGithub({ id: "github-passwordless", email: "passwordless@gmail.com", verified: true });
		expect((await finishSocialFlow(auth, "github", await startSocialFlow(auth, "github", { activeLanguage: "fr" }))).status).toBe(302);
		const user = await db.findOne<{ id: string }>({ model: "user", where: [{ field: "email", value: "passwordless@gmail.com" }] });
		if (!user) throw new Error("Expected the GitHub sign-up to create a user");
		const initial = await db.findMany<{ providerId: string }>({ model: "account", where: [{ field: "userId", value: user.id }] });
		expect(initial.map(({ providerId }) => providerId)).toEqual(["github"]);

		await auth.api.requestPasswordReset({ body: { email: "passwordless@gmail.com", redirectTo: `${APP_URL}/reset-password` } });
		expect(resetToken).toBeTruthy();
		await auth.api.resetPassword({ body: { newPassword: "correct-horse-battery-staple", token: resetToken as string } });

		const accounts = await db.findMany<{ providerId: string }>({ model: "account", where: [{ field: "userId", value: user.id }] });
		expect(accounts.map(({ providerId }) => providerId).sort()).toEqual(["credential", "github"]);
		await expect(
			auth.api.signInEmail({ body: { email: "passwordless@gmail.com", password: "correct-horse-battery-staple" } }),
		).resolves.toMatchObject({ user: { id: user.id } });
	});

	// The app configures no `account.accountLinking.trustedProviders`, so Better Auth
	// demands a provider-verified address before attaching an identity to an account
	// that already exists. Adding a provider to that list — an innocuous-looking change
	// — would let anyone who registers an unverified provider account under someone
	// else's address sign straight into it. These two cases pin that default down.
	it("refuses to sign an unverified GitHub identity into a matching existing account", async () => {
		const { auth, db } = await createAuthTestInstance();
		const signup = await auth.api.signUpEmail({
			body: { name: "Target User", email: "target@gmail.com", password: "correct-horse-battery-staple", activeLanguage: "en" },
		});
		await db.update({ model: "user", where: [{ field: "id", value: signup.user.id }], update: { emailVerified: true } });
		mockGithub({ id: "github-impostor", email: "target@gmail.com", verified: false });

		const callback = await finishSocialFlow(auth, "github", await startSocialFlow(auth, "github"));

		expect(callback.status).toBe(302);
		expect(new URL(callback.headers.get("location") as string).searchParams.get("error")).toBe("account_not_linked");
		await expect(db.findMany({ model: "account", where: [{ field: "userId", value: signup.user.id }] })).resolves.toHaveLength(1);
	});

	it("refuses to link an unverified GitHub identity from an authenticated session", async () => {
		const { auth, db, signInWithUser } = await createAuthTestInstance();
		const password = "correct-horse-battery-staple";
		const signup = await auth.api.signUpEmail({
			body: { name: "Target User", email: "target@gmail.com", password, activeLanguage: "en" },
		});
		await db.update({ model: "user", where: [{ field: "id", value: signup.user.id }], update: { emailVerified: true } });
		const { headers: sessionHeaders } = await signInWithUser("target@gmail.com", password);
		mockGithub({ id: "github-impostor", email: "target@gmail.com", verified: false });

		const callback = await finishSocialFlow(auth, "github", await startSocialLink(auth, "github", sessionHeaders));

		expect(callback.status).toBe(302);
		expect(new URL(callback.headers.get("location") as string).searchParams.get("error")).toBe("unable_to_link_account");
		await expect(db.findMany({ model: "account", where: [{ field: "providerId", value: "github" }] })).resolves.toHaveLength(0);
	});

	// Requiring the two addresses to match locked out anyone whose provider account
	// uses a different one — a work address here and a personal GitHub is ordinary.
	// The session already proves they hold this account and the round-trip proves
	// they hold the provider's, so there is nothing left for the equality to protect.
	it("links a verified GitHub identity that uses a different email", async () => {
		const { auth, db, signInWithUser } = await createAuthTestInstance();
		const password = "correct-horse-battery-staple";
		const signup = await auth.api.signUpEmail({
			body: {
				name: "Profile User",
				email: "profile@gmail.com",
				password,
				activeLanguage: "fr",
			},
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: signup.user.id }],
			update: { emailVerified: true },
		});
		const { headers: sessionHeaders } = await signInWithUser("profile@gmail.com", password);
		mockGithub({ id: "github-different-email", email: "different@gmail.com", verified: true });

		const flow = await startSocialLink(auth, "github", sessionHeaders);
		const callback = await finishSocialFlow(auth, "github", flow);
		const location = callback.headers.get("location");

		expect(callback.status).toBe(302);
		expect(location).toBe(`${APP_URL}/profile`);

		const accounts = await db.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: signup.user.id }],
		});
		expect(accounts.map((account) => account.providerId).sort()).toEqual(["credential", "github"]);

		// The Libiamo account keeps its own address: linking is not a merge.
		const user = await db.findOne<{ email: string }>({ model: "user", where: [{ field: "id", value: signup.user.id }] });
		expect(user?.email).toBe("profile@gmail.com");
		await expect(db.findMany({ model: "user", where: [{ field: "email", value: "different@gmail.com" }] })).resolves.toHaveLength(0);
	});

	// `allowDifferentEmails` governs linking that a session asked for. The signed-out
	// path finds the account by address in the first place, so it can only ever merge
	// matching addresses — and it still demands the local account confirmed its own,
	// which is what stops someone registering under a victim's address, leaving it
	// unconfirmed, and waiting to inherit the account the victim signs in to create.
	it("refuses to merge into an account that has not confirmed its own email", async () => {
		const { auth, db } = await createAuthTestInstance();
		const signup = await auth.api.signUpEmail({
			body: { name: "Unconfirmed User", email: "unconfirmed@gmail.com", password: "correct-horse-battery-staple", activeLanguage: "en" },
		});
		mockGithub({ id: "github-unconfirmed", email: "unconfirmed@gmail.com", verified: true });

		const callback = await finishSocialFlow(auth, "github", await startSocialFlow(auth, "github"));

		expect(callback.status).toBe(302);
		expect(new URL(callback.headers.get("location") as string).searchParams.get("error")).toBe("account_not_linked");
		const accounts = await db.findMany<{ providerId: string }>({ model: "account", where: [{ field: "userId", value: signup.user.id }] });
		expect(accounts.map(({ providerId }) => providerId)).toEqual(["credential"]);
	});

	// Letting this through would hand the address — and `user.email` is unique — to
	// whoever claimed it at the provider without proving anything, locking out its
	// actual owner. `requireEmailVerification` cannot help: the provider account is
	// attached, so they would sign in through it regardless.
	it("does not create an account when GitHub does not verify the email", async () => {
		const { auth, db } = await createAuthTestInstance();
		mockGithub({ id: "github-unverified-user", email: "unverified@gmail.com", verified: false });

		const flow = await startSocialFlow(auth, "github", { activeLanguage: "ja" });
		const callback = await finishSocialFlow(auth, "github", flow);

		expect(callback.status).toBe(302);
		// Better Auth discards the APIError code the `user.create.before` hook threw
		// and forwards the message with its spaces underscored; `socialAuthFailure`
		// reads it back from the same constant.
		const error = new URL(callback.headers.get("location") as string).searchParams.get("error");
		expect(socialAuthFailure(error)).toBe("provider-email-unverified");
		await expect(db.findOne({ model: "user", where: [{ field: "email", value: "unverified@gmail.com" }] })).resolves.toBeNull();
	});

	// Sign In carries no language — nobody chose one — so an unrecognised identity
	// arriving here is signed up on the default rather than bounced to Sign Up to
	// repeat the whole round-trip. The profile page can change it afterwards.
	it("creates an account from the Sign In flow using the default language", async () => {
		const { auth, db } = await createAuthTestInstance();
		mockGithub({ id: "github-sign-in-only", email: "sign-in-only@gmail.com", verified: true });

		const flow = await startSocialFlow(auth, "github");
		const callback = await finishSocialFlow(auth, "github", flow);

		expect(callback.status, await callback.clone().text()).toBe(302);
		expect(callback.headers.get("location")).toBe(APP_URL);
		const user = await db.findOne<{ id: string; activeLanguage: string; emailVerified: boolean }>({
			model: "user",
			where: [{ field: "email", value: "sign-in-only@gmail.com" }],
		});
		expect(user).toMatchObject({ activeLanguage: "en", emailVerified: true });
	});

	// A language that is present but unsupported is different from Sign In having
	// nothing to send: both entry points validate before they hand anything to
	// `signInSocial`, so it can only arrive from a request made by hand. This one
	// surfaces as a plain 400 rather than a redirect, because `mapProfileToUser`
	// runs during `getUserInfo`, outside the block whose rejections become redirects.
	it("rejects a social flow carrying an unsupported language", async () => {
		const { auth, db } = await createAuthTestInstance();
		mockGithub({ id: "github-bad-language", email: "bad-language@gmail.com", verified: true });

		const flow = await startSocialFlow(auth, "github", { activeLanguage: "klingon" });
		const callback = await finishSocialFlow(auth, "github", flow);

		expect(callback.status).toBe(400);
		await expect(db.findOne({ model: "user", where: [{ field: "email", value: "bad-language@gmail.com" }] })).resolves.toBeNull();
	});

	it("rejects email sign-up when the learning language is missing", async () => {
		const { auth, db } = await createAuthTestInstance();

		const response = await auth.handler(
			new Request(`${AUTH_BASE_URL}/sign-up/email`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: APP_URL },
				body: JSON.stringify({
					name: "Missing Language",
					email: "missing-language@gmail.com",
					password: "correct-horse-battery-staple",
				}),
			}),
		);
		expect(response.status).toBe(400);
		await expect(db.findOne({ model: "user", where: [{ field: "email", value: "missing-language@gmail.com" }] })).resolves.toBeNull();
	});
	describe("abuse protection", () => {
		const password = "correct-horse-battery-staple";

		it("refuses new accounts on untrusted mail domains, whichever way they arrive", async () => {
			const { auth, db } = await createAuthTestInstance();

			await expect(
				auth.api.signUpEmail({ body: { name: "Throwaway", email: "bot@mailinator.com", password, activeLanguage: "en" } }),
			).rejects.toMatchObject({ body: { code: "UNTRUSTED_EMAIL_DOMAIN" } });

			mockGithub({ id: "github-throwaway", email: "bot@custom-domain.dev", verified: true });
			const callback = await finishSocialFlow(auth, "github", await startSocialFlow(auth, "github", { activeLanguage: "en" }));
			expect(callback.status).toBe(302);
			const error = new URL(callback.headers.get("location") as string).searchParams.get("error");
			expect(socialAuthErrorMessage(error)).toMatch(/accepted provider/);

			await expect(db.findMany({ model: "user" })).resolves.toHaveLength(0);
		});

		it("refuses guessable passwords on every endpoint that sets one", async () => {
			let resetToken: string | undefined;
			const { auth, db, signInWithUser } = await createAuthTestInstance(undefined, undefined, {
				onResetPasswordToken: (token) => {
					resetToken = token;
				},
			});
			const weak = { body: { code: "WEAK_PASSWORD" } };

			await expect(
				auth.api.signUpEmail({ body: { name: "Weak", email: "weak@gmail.com", password: "password1", activeLanguage: "en" } }),
			).rejects.toMatchObject(weak);
			// Built from the learner's own address, which zxcvbn is told about.
			await expect(
				auth.api.signUpEmail({ body: { name: "Weak", email: "lindqvist@gmail.com", password: "lindqvist1", activeLanguage: "en" } }),
			).rejects.toMatchObject(weak);
			await expect(db.findMany({ model: "user" })).resolves.toHaveLength(0);

			const signup = await auth.api.signUpEmail({ body: { name: "User", email: "strong@gmail.com", password, activeLanguage: "en" } });
			await db.update({ model: "user", where: [{ field: "id", value: signup.user.id }], update: { emailVerified: true } });
			const { headers } = await signInWithUser("strong@gmail.com", password);
			await expect(auth.api.changePassword({ headers, body: { currentPassword: password, newPassword: "qwertyuiop" } })).rejects.toMatchObject(weak);

			await auth.api.requestPasswordReset({ body: { email: "strong@gmail.com", redirectTo: `${APP_URL}/reset-password` } });
			await expect(auth.api.resetPassword({ body: { newPassword: "12345678", token: resetToken as string } })).rejects.toMatchObject(weak);
			await expect(auth.api.signInEmail({ body: { email: "strong@gmail.com", password } })).resolves.toMatchObject({ user: { id: signup.user.id } });
		});

		it("refuses an over-long password without scoring it, ahead of the reset token check", async () => {
			const { auth } = await createAuthTestInstance();
			zxcvbnCalls.mockClear();

			const response = await auth.handler(
				new Request(`${AUTH_BASE_URL}/reset-password`, {
					method: "POST",
					headers: { "content-type": "application/json", origin: APP_URL },
					body: JSON.stringify({ newPassword: "a".repeat(1024), token: "not-a-token" }),
				}),
			);

			expect(response.status).toBe(400);
			expect(zxcvbnCalls).not.toHaveBeenCalled();
		});

		it("refuses an email change to an untrusted domain before sending mail", async () => {
			const { auth, db, signInWithUser } = await createAuthTestInstance();
			const signup = await auth.api.signUpEmail({ body: { name: "User", email: "learner@pku.edu.cn", password, activeLanguage: "en" } });
			await db.update({ model: "user", where: [{ field: "id", value: signup.user.id }], update: { emailVerified: true } });
			const { headers } = await signInWithUser("learner@pku.edu.cn", password);
			sentMail.mockClear();

			await expect(auth.api.changeEmail({ headers, body: { newEmail: "learner@edu.com" } })).rejects.toMatchObject({
				body: { code: "UNTRUSTED_EMAIL_DOMAIN" },
			});
			expect(sentMail).not.toHaveBeenCalled();
		});

		it("requires a Turnstile pass on direct HTTP sign-ups but leaves server calls to their callers", async () => {
			const { auth, db } = await createAuthTestInstance(undefined, undefined, {
				env: { TURNSTILE_SITE_KEY: "site-key", TURNSTILE_SECRET_KEY: "secret-key" },
			});
			const siteverify = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
				Response.json({ success: JSON.parse(String(init?.body)).response === "good-token" }),
			);
			vi.stubGlobal("fetch", siteverify);
			const signUp = (email: string, token?: string) =>
				auth.handler(
					new Request(`${AUTH_BASE_URL}/sign-up/email`, {
						method: "POST",
						headers: { "content-type": "application/json", origin: APP_URL, ...(token ? { "x-captcha-response": token } : {}) },
						body: JSON.stringify({ name: "Visitor", email, password, activeLanguage: "en" }),
					}),
				);

			expect((await signUp("no-token@gmail.com")).status).toBe(403);
			expect((await signUp("bad-token@gmail.com", "forged")).status).toBe(403);
			expect((await signUp("human@gmail.com", "good-token")).status).toBe(200);

			siteverify.mockClear();
			await auth.api.signUpEmail({ body: { name: "Form", email: "form@gmail.com", password, activeLanguage: "en" } });
			expect(siteverify).not.toHaveBeenCalled();

			const emails = (await db.findMany<{ email: string }>({ model: "user" })).map(({ email }) => email).sort();
			expect(emails).toEqual(["form@gmail.com", "human@gmail.com"]);

			const reset = await auth.handler(
				new Request(`${AUTH_BASE_URL}/reset-password`, {
					method: "POST",
					headers: { "content-type": "application/json", origin: APP_URL },
					body: JSON.stringify({ newPassword: password, token: "not-a-token" }),
				}),
			);
			expect(reset.status).toBe(403);
		});

		it("logs sign-ups and email changes only when AUTH_AUDIT_LOG is true", async () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			const auditLines = () =>
				info.mock.calls.map(([line]) => (typeof line === "string" && line.includes('"auth-audit"') ? JSON.parse(line) : null)).filter(Boolean);

			const quiet = await createAuthTestInstance();
			await quiet.auth.api.signUpEmail({ body: { name: "Quiet", email: "quiet@gmail.com", password, activeLanguage: "en" } });
			expect(auditLines()).toEqual([]);

			const { auth, db, signInWithUser } = await createAuthTestInstance(undefined, undefined, { env: { AUTH_AUDIT_LOG: "true" } });
			const signup = await auth.api.signUpEmail({ body: { name: "Logged", email: "logged@gmail.com", password, activeLanguage: "en" } });
			await db.update({ model: "user", where: [{ field: "id", value: signup.user.id }], update: { emailVerified: true } });
			const { headers } = await signInWithUser("logged@gmail.com", password);
			sentMail.mockClear();
			await auth.api.changeEmail({ headers, body: { newEmail: "moved@qq.com", callbackURL: "/verify?emailChange=1" } });
			const token = new URL(sentMail.mock.calls[0][0].html).searchParams.get("token") as string;
			await auth.api.verifyEmail({ query: { token }, headers });

			expect(auditLines()).toEqual([
				expect.objectContaining({ event: "auth.sign_up", userId: signup.user.id, email: "logged@gmail.com", method: "email" }),
				expect.objectContaining({ event: "auth.email_change_requested", userId: signup.user.id, from: "logged@gmail.com", to: "moved@qq.com" }),
				expect.objectContaining({ event: "auth.email_changed", userId: signup.user.id, email: "moved@qq.com" }),
			]);
			info.mockRestore();
		});

		it("logs password changes and resets and login-method links, but not a provider sign-up as a link", async () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			const auditLines = () =>
				info.mock.calls.map(([line]) => (typeof line === "string" && line.includes('"auth-audit"') ? JSON.parse(line) : null)).filter(Boolean);
			let resetToken: string | undefined;
			const { auth, db, signInWithUser } = await createAuthTestInstance(undefined, undefined, {
				env: { AUTH_AUDIT_LOG: "true" },
				onResetPasswordToken: (token) => {
					resetToken = token;
				},
				// What `getRequestEvent()` supplies when a form action calls `auth.api` without a request.
				requestHeaders: () => new Headers({ "x-real-ip": "203.0.113.9" }),
			});
			const signup = await auth.api.signUpEmail({ body: { name: "Mover", email: "mover@gmail.com", password, activeLanguage: "en" } });
			await db.update({ model: "user", where: [{ field: "id", value: signup.user.id }], update: { emailVerified: true } });
			const { headers } = await signInWithUser("mover@gmail.com", password);
			const newPassword = "velvet-otter-harbor-92";
			await auth.api.changePassword({ headers, body: { currentPassword: password, newPassword } });
			mockGithub({ id: "audit-github", email: "mover-elsewhere@gmail.com", verified: true });
			await finishSocialFlow(auth, "github", await startSocialLink(auth, "github", headers));
			await auth.api.unlinkAccount({ headers, body: { providerId: "github" } });
			await auth.api.requestPasswordReset({ body: { email: "mover@gmail.com", redirectTo: `${APP_URL}/reset-password` } });
			await auth.api.resetPassword({ body: { newPassword: "quiet-lantern-meadow-47", token: resetToken as string } });

			mockGithub({ id: "audit-github-new", email: "newcomer@gmail.com", verified: true });
			await finishSocialFlow(auth, "github", await startSocialFlow(auth, "github", { activeLanguage: "en" }));

			const userId = signup.user.id;
			expect(auditLines().map(({ at: _, ip: __, type: ___, ...line }) => line)).toEqual([
				{ event: "auth.sign_up", userId, email: "mover@gmail.com", method: "email" },
				{ event: "auth.password_changed", userId, email: "mover@gmail.com" },
				{ event: "auth.account_linked", userId, provider: "github" },
				{ event: "auth.account_unlinked", userId, provider: "github" },
				{ event: "auth.password_reset", userId, email: "mover@gmail.com" },
				expect.objectContaining({ event: "auth.sign_up", email: "newcomer@gmail.com", method: "github" }),
			]);
			expect(auditLines().find(({ event }) => event === "auth.password_reset").ip).toBe("203.0.113.9");
			info.mockRestore();
		});
	});
});
