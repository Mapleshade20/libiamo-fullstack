import { convertSetCookieToCookie, getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapOAuthProfileToUser, prepareOAuthUser } from "$lib/server/auth/social";

const AUTH_BASE_URL = "http://localhost:3000/api/auth";
const APP_URL = "http://localhost:3000";

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

async function createAuthTestInstance(googleIdentity: GithubIdentity = { id: "google-user", email: "google@example.com", verified: true }) {
	return getTestInstance(
		{
			socialProviders: {
				github: {
					clientId: "github-client-id",
					clientSecret: "github-client-secret",
					disableImplicitSignUp: true,
					mapProfileToUser: mapOAuthProfileToUser,
				},
				google: {
					clientId: "google-client-id",
					clientSecret: "google-client-secret",
					disableImplicitSignUp: true,
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
			account: {
				encryptOAuthTokens: true,
			},
			databaseHooks: {
				user: {
					create: {
						before: prepareOAuthUser,
					},
				},
			},
			user: {
				additionalFields: {
					activeLanguage: { type: "string", required: true, input: true },
				},
			},
		},
		{ disableTestUser: true },
	);
}

async function startSocialFlow(
	auth: Awaited<ReturnType<typeof createAuthTestInstance>>["auth"],
	provider: "github" | "google",
	options: { activeLanguage?: string; requestSignUp?: boolean } = {},
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
				errorCallbackURL: `${APP_URL}/signin`,
				disableRedirect: true,
				requestSignUp: options.requestSignUp,
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

async function startGithubLink(auth: Awaited<ReturnType<typeof createAuthTestInstance>>["auth"], sessionHeaders: Headers) {
	const requestHeaders = new Headers(sessionHeaders);
	requestHeaders.set("content-type", "application/json");
	requestHeaders.set("origin", APP_URL);
	const response = await auth.handler(
		new Request(`${AUTH_BASE_URL}/link-social`, {
			method: "POST",
			headers: requestHeaders,
			body: JSON.stringify({
				provider: "github",
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

describe("Better Auth social authentication lifecycle", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("creates a passwordless account from a verified GitHub identity and keeps the selected language", async () => {
		const { auth, db } = await createAuthTestInstance();
		mockGithub({ id: "github-new-user", email: "new@example.com", verified: true });

		const flow = await startSocialFlow(auth, "github", { activeLanguage: "fr", requestSignUp: true });
		const callback = await finishSocialFlow(auth, "github", flow);

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe(APP_URL);

		const user = await db.findOne<{ id: string; activeLanguage: string; emailVerified: boolean }>({
			model: "user",
			where: [{ field: "email", value: "new@example.com" }],
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
		await expect(db.findMany({ model: "user", where: [{ field: "email", value: "new@example.com" }] })).resolves.toHaveLength(1);

		const sessionHeaders = convertSetCookieToCookie(new Headers(returningCallback.headers));
		await expect(auth.api.unlinkAccount({ body: { providerId: "github" }, headers: sessionHeaders })).rejects.toMatchObject({
			body: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" },
		});
	});

	it("creates a passwordless account from a verified Google identity", async () => {
		const { auth, db } = await createAuthTestInstance({
			id: "google-new-user",
			email: "google-new@example.com",
			verified: true,
		});
		mockGoogle();

		const flow = await startSocialFlow(auth, "google", { activeLanguage: "ja", requestSignUp: true });
		const callback = await finishSocialFlow(auth, "google", flow);

		expect(callback.status, await callback.clone().text()).toBe(302);
		const user = await db.findOne<{ id: string; activeLanguage: string; emailVerified: boolean }>({
			model: "user",
			where: [{ field: "email", value: "google-new@example.com" }],
		});
		expect(user).toMatchObject({ activeLanguage: "ja", emailVerified: true });
		if (!user) throw new Error("Expected the Google user to be created");
		await expect(db.findMany({ model: "account", where: [{ field: "userId", value: user.id }] })).resolves.toHaveLength(1);

		const returningFlow = await startSocialFlow(auth, "google");
		const returningCallback = await finishSocialFlow(auth, "google", returningFlow);
		expect(returningCallback.status, await returningCallback.clone().text()).toBe(302);
		await expect(db.findMany({ model: "user", where: [{ field: "email", value: "google-new@example.com" }] })).resolves.toHaveLength(1);
	});

	it("links a verified GitHub identity to an existing verified account with the same email", async () => {
		const { auth, db } = await createAuthTestInstance();
		const signup = await auth.api.signUpEmail({
			body: {
				name: "Existing User",
				email: "existing@example.com",
				password: "correct-horse-battery-staple",
				activeLanguage: "es",
			},
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: signup.user.id }],
			update: { emailVerified: true },
		});
		mockGithub({ id: "github-existing-user", email: "existing@example.com", verified: true });

		const flow = await startSocialFlow(auth, "github");
		const callback = await finishSocialFlow(auth, "github", flow);

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe(APP_URL);

		const users = await db.findMany<{ id: string }>({
			model: "user",
			where: [{ field: "email", value: "existing@example.com" }],
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
				email: "profile@example.com",
				password,
				activeLanguage: "fr",
			},
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: signup.user.id }],
			update: { emailVerified: true },
		});
		const { headers: sessionHeaders } = await signInWithUser("profile@example.com", password);
		mockGithub({ id: "github-profile-user", email: "profile@example.com", verified: true });

		const flow = await startGithubLink(auth, sessionHeaders);
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

	it("does not create an account when GitHub does not verify the email", async () => {
		const { auth, db } = await createAuthTestInstance();
		mockGithub({ id: "github-unverified-user", email: "unverified@example.com", verified: false });

		const flow = await startSocialFlow(auth, "github", { activeLanguage: "ja", requestSignUp: true });
		const callback = await finishSocialFlow(auth, "github", flow);

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toContain("/signin?error=");
		await expect(db.findOne({ model: "user", where: [{ field: "email", value: "unverified@example.com" }] })).resolves.toBeNull();
	});

	it("does not implicitly create an account from the Sign In flow", async () => {
		const { auth, db } = await createAuthTestInstance();
		mockGithub({ id: "github-sign-in-only", email: "sign-in-only@example.com", verified: true });

		const flow = await startSocialFlow(auth, "github", { activeLanguage: "fr" });
		const callback = await finishSocialFlow(auth, "github", flow);

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toContain("/signin?error=signup_disabled");
		await expect(db.findOne({ model: "user", where: [{ field: "email", value: "sign-in-only@example.com" }] })).resolves.toBeNull();
	});

	it("rejects email sign-up when the learning language is missing", async () => {
		const { auth, db } = await createAuthTestInstance();

		const response = await auth.handler(
			new Request(`${AUTH_BASE_URL}/sign-up/email`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: APP_URL },
				body: JSON.stringify({
					name: "Missing Language",
					email: "missing-language@example.com",
					password: "correct-horse-battery-staple",
				}),
			}),
		);
		expect(response.status).toBe(400);
		await expect(db.findOne({ model: "user", where: [{ field: "email", value: "missing-language@example.com" }] })).resolves.toBeNull();
	});
});
