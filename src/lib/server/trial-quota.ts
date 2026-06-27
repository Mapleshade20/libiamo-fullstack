import { eq, sql } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import { db } from "./db";
import { userApiKey, userQuota } from "./db/schema";

const FALLBACK_TRIAL_TOKEN_BUDGET = 50_000;

export class TrialQuotaExhaustedError extends Error {
	constructor(
		public readonly trialTokensTotal: number,
		public readonly trialTokensLeft = 0,
	) {
		super("Trial token budget exhausted. Configure your own API key to continue using AI features.");
		this.name = "TrialQuotaExhaustedError";
	}
}

export type TrialQuotaBalance = {
	trialTokensLeft: number;
	trialTokensTotal: number;
};

export type TrialQuotaWarning = "low" | "depleted";

export type TrialQuotaStatus = TrialQuotaBalance & {
	trialTokensUsed: number;
	trialUsageEstimated: boolean;
	trialQuotaWarning: TrialQuotaWarning | null;
};

export function getTrialTokenBudget(): number {
	const raw = env.TRIAL_TOKEN_BUDGET?.trim();
	// Source of truth for new user trial grants. Existing users keep the values
	// persisted in user_quota; changing this env var does not mutate existing rows.
	if (!raw) return FALLBACK_TRIAL_TOKEN_BUDGET;

	if (!/^\d+$/.test(raw)) {
		throw new Error("TRIAL_TOKEN_BUDGET must be a positive integer");
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error("TRIAL_TOKEN_BUDGET must be a positive integer");
	}
	return parsed;
}

export async function hasUserApiKey(userId: string): Promise<boolean> {
	const row = await db.query.userApiKey.findFirst({
		where: eq(userApiKey.userId, userId),
		columns: { userId: true },
	});
	return row !== undefined;
}

async function ensureUserQuota(userId: string): Promise<TrialQuotaBalance> {
	const existing = await db.query.userQuota.findFirst({
		where: eq(userQuota.userId, userId),
		columns: { trialTokensLeft: true, trialTokensTotal: true },
	});
	if (existing) return existing;

	const budget = getTrialTokenBudget();
	const [inserted] = await db
		.insert(userQuota)
		.values({ userId, trialTokensLeft: budget, trialTokensTotal: budget })
		.onConflictDoNothing()
		.returning({ trialTokensLeft: userQuota.trialTokensLeft, trialTokensTotal: userQuota.trialTokensTotal });

	if (inserted) return inserted;

	const row = await db.query.userQuota.findFirst({
		where: eq(userQuota.userId, userId),
		columns: { trialTokensLeft: true, trialTokensTotal: true },
	});
	if (!row) throw new Error("Failed to initialize trial quota");
	return row;
}

export async function getTrialQuotaBalance(userId: string): Promise<TrialQuotaBalance> {
	return ensureUserQuota(userId);
}

export async function assertTrialQuotaAvailable(userId: string): Promise<TrialQuotaBalance> {
	const balance = await ensureUserQuota(userId);
	if (balance.trialTokensLeft <= 0) {
		throw new TrialQuotaExhaustedError(balance.trialTokensTotal, balance.trialTokensLeft);
	}

	return balance;
}

export async function debitTrialQuota(userId: string, tokens: number, estimated: boolean): Promise<TrialQuotaStatus> {
	const tokensToDebit = Math.max(0, Math.ceil(tokens));
	if (tokensToDebit === 0) {
		const balance = await ensureUserQuota(userId);
		return { ...balance, trialTokensUsed: 0, trialUsageEstimated: estimated, trialQuotaWarning: quotaWarning(balance) };
	}

	const nextBalance = sql<number>`GREATEST(0, ${userQuota.trialTokensLeft} - ${tokensToDebit})`;
	const [updated] = await db
		.update(userQuota)
		.set({
			trialTokensLeft: nextBalance,
			updatedAt: new Date(),
		})
		.where(eq(userQuota.userId, userId))
		.returning({ trialTokensLeft: userQuota.trialTokensLeft, trialTokensTotal: userQuota.trialTokensTotal });

	if (!updated) {
		throw new Error("Failed to debit trial quota");
	}

	return {
		...updated,
		trialTokensUsed: tokensToDebit,
		trialUsageEstimated: estimated,
		trialQuotaWarning: quotaWarning(updated),
	};
}

function quotaWarning(balance: TrialQuotaBalance): TrialQuotaWarning | null {
	if (balance.trialTokensLeft <= 0) return "depleted";
	if (balance.trialTokensLeft <= Math.floor(balance.trialTokensTotal * 0.1)) return "low";
	return null;
}
