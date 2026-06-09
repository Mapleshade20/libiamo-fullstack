import { describe, expect, it } from "vitest";
import { load } from "$routes/(app)/+layout.server";

const ALICE_EMAIL_MD5 = "c160f8cc69a4f0bf2b0362752353d060";
const EMPTY_MD5 = "d41d8cd98f00b204e9800998ecf8427e";

describe("(app) layout +layout.server", () => {
	it("redirects to sign-in when user is missing", async () => {
		await expect(load({ locals: { user: null } } as any)).rejects.toMatchObject({
			status: 302,
			location: "/sign-in",
		});
	});

	it("returns user and gravatar url when user exists", async () => {
		const user = {
			id: "u1",
			name: "Alice",
			email: "Alice@Example.com",
			role: "learner",
			activeLanguage: "en",
			timezone: "UTC",
			nativeLanguage: "es",
		};

		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.user).toEqual({
			name: "Alice",
			email: "Alice@Example.com",
			role: "learner",
			activeLanguage: "en",
			timezone: "UTC",
			nativeLanguage: "es",
		});
		expect(result.avatarUrl).toBe(`https://gravatar.com/avatar/${ALICE_EMAIL_MD5}?d=identicon&s=192`);
	});

	it("uses empty email fallback when user email is missing", async () => {
		const user = { id: "u2" };

		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.avatarUrl).toBe(`https://gravatar.com/avatar/${EMPTY_MD5}?d=identicon&s=192`);
	});
});
