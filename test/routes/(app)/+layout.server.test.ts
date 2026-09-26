import { describe, expect, it, vi } from "vitest";
import { load } from "$routes/(app)/+layout.server";

const mocks = vi.hoisted(() => ({ queueEmpty: vi.fn(async () => true), observe: vi.fn(), db: { select: vi.fn() } }));
vi.mock("$lib/server/db", () => ({ db: mocks.db }));
vi.mock("$lib/server/streak", () => ({
	getStreakRecord: vi.fn(async () => null),
	devStreakDayOffset: vi.fn(() => 0),
	isReviewQueueEmpty: mocks.queueEmpty,
	recordReviewObservation: mocks.observe,
}));
vi.mock("$lib/server/account/trial-quota", () => ({
	hasUserApiKey: vi.fn(async () => false),
	getTrialQuotaBalance: vi.fn(async () => ({ trialTokensLeft: 50_000, trialTokensTotal: 50_000 })),
}));

function signedOut(path: string) {
	const url = new URL(`https://libiamo.test${path}`);
	const tracked = vi.fn();
	let untracked = false;
	const event = {
		locals: { user: null },
		get url() {
			if (!untracked) tracked();
			return url;
		},
		untrack: <T>(read: () => T) => {
			untracked = true;
			try {
				return read();
			} finally {
				untracked = false;
			}
		},
	};
	return { event, tracked };
}

const ALICE_EMAIL_MD5 = "c160f8cc69a4f0bf2b0362752353d060";
const EMPTY_MD5 = "d41d8cd98f00b204e9800998ecf8427e";

describe("(app) layout +layout.server", () => {
	it("redirects signed-out root visits to the public homepage without tracking the URL", async () => {
		const { event, tracked } = signedOut("/");
		await expect(load(event as any)).rejects.toMatchObject({ status: 302, location: "/welcome" });
		// A tracked pathname would re-run the layout, and its queries, on every navigation.
		expect(tracked).not.toHaveBeenCalled();
	});

	it.each(["/archive", "/review", "/profile", "/task/1", "/translate/1"])("redirects signed-out visits to %s through sign-in", async (path) => {
		await expect(load(signedOut(path).event as any)).rejects.toMatchObject({
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
			nativeLanguage: "es",
		};

		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.user).toEqual({
			id: "u1",
			name: "Alice",
			email: "Alice@Example.com",
			role: "learner",
			activeLanguage: "en",
			nativeLanguage: "es",
		});
		expect(result.avatarUrl).toBe(`https://gravatar.com/avatar/${ALICE_EMAIL_MD5}?d=identicon&s=192`);
		expect(result.streakQueueEmpty).toBe(true);
		expect(mocks.queueEmpty).toHaveBeenCalledWith(mocks.db, "u1", expect.any(Date));
		expect(mocks.observe).not.toHaveBeenCalled();
	});

	it("uses empty email fallback when user email is missing", async () => {
		const user = { id: "u2" };

		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.avatarUrl).toBe(`https://gravatar.com/avatar/${EMPTY_MD5}?d=identicon&s=192`);
	});
});
