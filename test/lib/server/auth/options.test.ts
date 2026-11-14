import { getTestInstance } from "better-auth/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The Better Auth configuration the app ships, on Better Auth's own in-memory test instance: the password rule on every
 * way in, the non-enumerating sign-up, the admin list, Turnstile on the signed-out endpoints.
 */
const { env, sent } = vi.hoisted(() => ({
	env: {
		ORIGIN: "http://localhost:3000",
		BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-for-it",
		ADMIN_EMAILS: [] as string[],
		ADDRESS_HEADER: undefined,
		AUTH_AUDIT_LOG: false,
		TURNSTILE_SITE_KEY: undefined as string | undefined,
		TURNSTILE_SECRET_KEY: undefined as string | undefined,
		GOOGLE_CLIENT_ID: undefined,
		GOOGLE_CLIENT_SECRET: undefined,
		GITHUB_CLIENT_ID: undefined,
		GITHUB_CLIENT_SECRET: undefined,
		SMTP_HOST: undefined,
		SMTP_PORT: 465,
		SMTP_SECURE: true,
		SMTP_FROM: undefined,
		SMTP_USER: undefined,
		SMTP_PASS: undefined,
	},
	sent: [] as { to: string; subject: string; text: string }[],
}));
vi.mock("$app/env/private", () => env);
vi.mock("$app/env", () => ({ dev: true, building: false }));
vi.mock("#lib/server/auth/email.ts", async (original) => ({
	...(await original<typeof import("#lib/server/auth/email.ts")>()),
	send: (m: { to: string; subject: string; text: string }) => sent.push(m),
}));

const { createAuthOptions } = await import("#lib/server/auth/options.ts");

const store = { unlinkAccount: vi.fn(), hasPassword: vi.fn(async () => true), grantAdmin: vi.fn(async () => true), clearPendingEmail: vi.fn() };
const instance = () => getTestInstance(createAuthOptions(store), { disableTestUser: true });
const signUp = (client: Awaited<ReturnType<typeof instance>>["client"], email: string, password: string) =>
	client.signUp.email({ email, password, name: "Ada" });

beforeEach(() => {
	sent.length = 0;
	env.ADMIN_EMAILS = [];
	env.TURNSTILE_SITE_KEY = env.TURNSTILE_SECRET_KEY = undefined;
	vi.clearAllMocks();
});

describe("signing up", () => {
	it("refuses a guessable password with the key the page shows", async () => {
		const { client } = await instance();
		const { error } = await signUp(client, "ada@example.test", "password123");
		expect(error?.code).toBe("WEAK_PASSWORD");
		expect(error?.message).toBe("auPwGuessable");
	});

	it("mails the link, and answers an address that has an account the same way while telling its mailbox", async () => {
		const { client } = await instance();
		const first = await signUp(client, "ada@example.test", "plum orchard lantern 47");
		expect(first.error).toBeNull();
		expect(sent.map((m) => m.subject)).toEqual(["Libiamo · Confirm your email"]);
		expect(sent[0].text).toContain("/api/auth/verify-email?token=");

		const again = await signUp(client, "ada@example.test", "another strong passphrase 9");
		expect(again.error).toBeNull();
		expect(Object.keys(again.data ?? {}).sort()).toEqual(Object.keys(first.data ?? {}).sort());
		expect(sent.at(-1)?.subject).toBe("Libiamo · You already have an account");
	});

	it("needs Turnstile's pass when it is configured", async () => {
		env.TURNSTILE_SITE_KEY = "site";
		env.TURNSTILE_SECRET_KEY = "secret";
		const { client } = await instance();
		const { error } = await signUp(client, "ada@example.test", "plum orchard lantern 47");
		expect(error?.code).toBe("CAPTCHA_FAILED");
	});
});

describe("signing in", () => {
	it("asks the store to grant the admin role when there is a list", async () => {
		env.ADMIN_EMAILS = ["ada@example.test"];
		const { client, auth } = await instance();
		await signUp(client, "ada@example.test", "plum orchard lantern 47");
		const ctx = await auth.$context;
		const found = await ctx.internalAdapter.findUserByEmail("ada@example.test");
		await ctx.internalAdapter.updateUser(found?.user.id as string, { emailVerified: true });
		const { error } = await client.signIn.email({ email: "ada@example.test", password: "plum orchard lantern 47" });
		expect(error).toBeNull();
		expect(store.grantAdmin).toHaveBeenCalledWith(found?.user.id, ["ada@example.test"]);
	});

	it("does not touch roles without a list", async () => {
		const { client, auth } = await instance();
		await signUp(client, "ada@example.test", "plum orchard lantern 47");
		const ctx = await auth.$context;
		const found = await ctx.internalAdapter.findUserByEmail("ada@example.test");
		await ctx.internalAdapter.updateUser(found?.user.id as string, { emailVerified: true });
		await client.signIn.email({ email: "ada@example.test", password: "plum orchard lantern 47" });
		expect(store.grantAdmin).not.toHaveBeenCalled();
	});
});
