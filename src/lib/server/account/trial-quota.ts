import { eq, sql } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import { nextTrialRelease, releasedTrialTokens, type TrialQuotaBalance, type TrialQuotaWarning, trialQuotaWarning } from "$lib/account/trial-release";
import { db } from "../db";
import { user, userApiKey, userQuota } from "../db/schema";

const FALLBACK_TRIAL_TOKEN_BUDGET = 50_000;
const FALLBACK_TRIAL_TOKEN_HOLD = 4_096;

export type { TrialQuotaBalance, TrialQuotaWarning };

export class TrialQuotaExhaustedError extends Error {
	constructor(
		public readonly trialTokensTotal: number,
		public readonly trialTokensLeft = 0,
	) {
		super("Trial token budget exhausted. Configure your own API key to continue using AI features.");
		this.name = "TrialQuotaExhaustedError";
	}
}

export type TrialQuotaStatus = TrialQuotaBalance & {
	trialTokensUsed: number;
	trialUsageEstimated: boolean;
	trialQuotaWarning: TrialQuotaWarning | null;
};

/** Tokens set aside for one call in flight, settled against what the provider reports. */
export type TrialQuotaHold = {
	userId: string;
	tokens: number;
};

function positiveIntegerEnv(name: string, fallback: number): number {
	const raw = env[name]?.trim();
	if (!raw) return fallback;

	const parsed = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
	return parsed;
}

export function getTrialTokenBudget(): number {
	// Source of truth for new user trial grants. Existing users keep the values
	// persisted in user_quota; changing this env var does not mutate existing rows.
	return positiveIntegerEnv("TRIAL_TOKEN_BUDGET", FALLBACK_TRIAL_TOKEN_BUDGET);
}

/**
 * What a call holds back from the balance before it reaches the provider: a little more than a
 * typical call spends. Concurrent calls then drain the balance up front and the ones that find it
 * empty are refused, instead of all passing a "balance is positive" check and debiting afterwards.
 */
export function getTrialTokenHold(): number {
	return positiveIntegerEnv("TRIAL_TOKEN_HOLD", FALLBACK_TRIAL_TOKEN_HOLD);
}

export async function hasUserApiKey(userId: string): Promise<boolean> {
	const row = await db.query.userApiKey.findFirst({
		where: eq(userApiKey.userId, userId),
		columns: { userId: true },
	});
	return row !== undefined;
}

const quotaColumns = {
	trialTokensLeft: userQuota.trialTokensLeft,
	trialTokensTotal: userQuota.trialTokensTotal,
	trialTokensReleased: userQuota.trialTokensReleased,
	trialReleaseStartedAt: userQuota.trialReleaseStartedAt,
};

type QuotaRow = {
	trialTokensLeft: number;
	trialTokensTotal: number;
	trialTokensReleased: number;
	trialReleaseStartedAt: Date;
};

function findQuotaRow(userId: string): Promise<QuotaRow | undefined> {
	return db.query.userQuota.findFirst({
		where: eq(userQuota.userId, userId),
		columns: { trialTokensLeft: true, trialTokensTotal: true, trialTokensReleased: true, trialReleaseStartedAt: true },
	});
}

async function createQuotaRow(userId: string, now: Date): Promise<QuotaRow> {
	// The release clock starts at sign-up, not at the first visit that happens to create this row.
	const owner = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { createdAt: true } });
	const startedAt = owner?.createdAt ?? now;
	const budget = getTrialTokenBudget();
	const released = releasedTrialTokens(budget, startedAt, now);
	const [inserted] = await db
		.insert(userQuota)
		.values({ userId, trialTokensLeft: released, trialTokensTotal: budget, trialTokensReleased: released, trialReleaseStartedAt: startedAt })
		.onConflictDoNothing()
		.returning(quotaColumns);
	if (inserted) return inserted;

	const row = await findQuotaRow(userId);
	if (!row) throw new Error("Failed to initialize trial quota");
	return row;
}

/** Adds any part of the grant that has come due. Idempotent under concurrency: the guard admits one writer. */
async function releaseDueTokens(userId: string, row: QuotaRow, now: Date): Promise<QuotaRow> {
	const due = releasedTrialTokens(row.trialTokensTotal, row.trialReleaseStartedAt, now);
	if (due <= row.trialTokensReleased) return row;

	const [updated] = await db
		.update(userQuota)
		.set({
			trialTokensLeft: sql`${userQuota.trialTokensLeft} + ${due} - ${userQuota.trialTokensReleased}`,
			trialTokensReleased: due,
			updatedAt: now,
		})
		.where(sql`${userQuota.userId} = ${userId} and ${userQuota.trialTokensReleased} < ${due}`)
		.returning(quotaColumns);
	return updated ?? (await findQuotaRow(userId)) ?? row;
}

function toBalance(row: QuotaRow, now: Date): TrialQuotaBalance {
	return {
		// A debt (see `settleTrialQuota`) reads as an empty balance.
		trialTokensLeft: Math.max(0, row.trialTokensLeft),
		trialTokensTotal: row.trialTokensTotal,
		trialTokensReleased: row.trialTokensReleased,
		trialNextReleaseAt: nextTrialRelease(row.trialTokensTotal, row.trialReleaseStartedAt, now)?.at ?? null,
	};
}

async function ensureUserQuota(userId: string): Promise<TrialQuotaBalance> {
	const now = new Date();
	const row = (await findQuotaRow(userId)) ?? (await createQuotaRow(userId, now));
	return toBalance(await releaseDueTokens(userId, row, now), now);
}

export async function getTrialQuotaBalance(userId: string): Promise<TrialQuotaBalance> {
	return ensureUserQuota(userId);
}

/**
 * Holds `getTrialTokenHold()` tokens (or whatever is left, if less) for one call. The row lock makes
 * the check and the hold one step, so a burst of calls cannot all pass on the same balance. Every
 * hold must end in `settleTrialQuota` or `refundTrialQuotaHold`.
 */
export async function reserveTrialQuota(userId: string): Promise<TrialQuotaHold> {
	await ensureUserQuota(userId);
	const holdSize = getTrialTokenHold();
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ trialTokensLeft: userQuota.trialTokensLeft, trialTokensTotal: userQuota.trialTokensTotal })
			.from(userQuota)
			.where(eq(userQuota.userId, userId))
			.for("update");
		if (!row) throw new Error("Failed to initialize trial quota");
		if (row.trialTokensLeft <= 0) throw new TrialQuotaExhaustedError(row.trialTokensTotal, row.trialTokensLeft);

		const tokens = Math.min(row.trialTokensLeft, holdSize);
		await tx
			.update(userQuota)
			.set({ trialTokensLeft: row.trialTokensLeft - tokens, updatedAt: new Date() })
			.where(eq(userQuota.userId, userId));
		return { userId, tokens };
	});
}

/**
 * Returns the hold and debits what the call actually used, even below zero. Other holds have already
 * left the balance, so clamping here would forget the overspend and a later refund would make it
 * spendable again; the final balance must not depend on the order calls settle in.
 */
export async function settleTrialQuota(hold: TrialQuotaHold, tokens: number, estimated: boolean): Promise<TrialQuotaStatus> {
	const tokensToDebit = Math.max(0, Math.ceil(tokens));
	const now = new Date();
	const [updated] = await db
		.update(userQuota)
		.set({
			trialTokensLeft: sql<number>`${userQuota.trialTokensLeft} + ${hold.tokens} - ${tokensToDebit}`,
			updatedAt: now,
		})
		.where(eq(userQuota.userId, hold.userId))
		.returning(quotaColumns);

	if (!updated) {
		throw new Error("Failed to debit trial quota");
	}

	const balance = toBalance(updated, now);
	return {
		...balance,
		trialTokensUsed: tokensToDebit,
		trialUsageEstimated: estimated,
		trialQuotaWarning: trialQuotaWarning(balance),
	};
}

/** Gives a hold back in full, for calls that failed before the provider reported usage. */
export async function refundTrialQuotaHold(hold: TrialQuotaHold): Promise<void> {
	if (hold.tokens <= 0) return;
	await db
		.update(userQuota)
		.set({ trialTokensLeft: sql`${userQuota.trialTokensLeft} + ${hold.tokens}`, updatedAt: new Date() })
		.where(eq(userQuota.userId, hold.userId));
}
