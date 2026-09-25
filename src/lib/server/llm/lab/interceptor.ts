import { and, eq } from "drizzle-orm";
import { isReasoningEffort } from "$lib/constants";
import { db } from "$lib/server/db";
import { user } from "$lib/server/db/auth.schema";
import { llmOverride, llmTraceOptOut, userApiKey } from "$lib/server/db/schema";
import { isProviderRef, resolveProviderRef } from "../providers";
import type { LlmCallInterceptor, LlmCallPlan, LlmVariant } from "../run";
import { insertTrace } from "./traces";

export type CapturePolicyInput = { role: string | null; hasApiKey: boolean; optedOut: boolean };

/**
 * Real-flow calls are captured by default. Only learners with their own API key can opt out, and the
 * opt-out lapses while they have no key (the setting is hidden then); staff are always captured.
 */
export function shouldCaptureCall(input: CapturePolicyInput): boolean {
	return input.role === "admin" || !input.hasApiKey || !input.optedOut;
}

type OverrideRow = {
	id: number;
	slots: Record<string, string>;
	providerRef: string | null;
	temperature: number | null;
	reasoningEffort: string | null;
};

async function overrideVariant(row: OverrideRow, userId: string): Promise<LlmVariant> {
	let provider: LlmVariant["provider"];
	if (row.providerRef && isProviderRef(row.providerRef)) {
		try {
			provider = await resolveProviderRef(row.providerRef, userId);
		} catch (error) {
			console.warn(`[llm] Override ${row.id} provider ${row.providerRef} is unavailable; using normal routing.`, error);
		}
	}
	const options = {
		...(row.temperature === null ? {} : { temperature: row.temperature }),
		...(isReasoningEffort(row.reasoningEffort) ? { reasoningEffort: row.reasoningEffort } : {}),
	};
	return {
		...(Object.keys(row.slots).length ? { slots: row.slots } : {}),
		...(provider ? { provider } : {}),
		...(Object.keys(options).length ? { options } : {}),
	};
}

/** One indexed lookup per call: the caller's role, key, opt-out and enabled override for this recipe. */
export const labInterceptor: LlmCallInterceptor = {
	async prepare({ recipe, userId }): Promise<LlmCallPlan> {
		if (!userId) return { capture: false };
		const [row] = await db
			.select({
				role: user.role,
				apiKeyUserId: userApiKey.userId,
				optedOutAt: llmTraceOptOut.optedOutAt,
				overrideId: llmOverride.id,
				slots: llmOverride.slots,
				providerRef: llmOverride.providerRef,
				temperature: llmOverride.temperature,
				reasoningEffort: llmOverride.reasoningEffort,
			})
			.from(user)
			.leftJoin(userApiKey, eq(userApiKey.userId, user.id))
			.leftJoin(llmTraceOptOut, eq(llmTraceOptOut.userId, user.id))
			.leftJoin(llmOverride, and(eq(llmOverride.userId, user.id), eq(llmOverride.recipeId, recipe.id), eq(llmOverride.enabled, true)))
			.where(eq(user.id, userId))
			.limit(1);
		if (!row) return { capture: false };
		const capture = shouldCaptureCall({ role: row.role, hasApiKey: row.apiKeyUserId !== null, optedOut: row.optedOutAt !== null });
		// Overrides apply only while the owner is still staff.
		if (row.role !== "admin" || row.overrideId === null) return { capture };
		const variant = await overrideVariant(
			{
				id: row.overrideId,
				slots: row.slots ?? {},
				providerRef: row.providerRef,
				temperature: row.temperature,
				reasoningEffort: row.reasoningEffort,
			},
			userId,
		);
		return { capture: true, override: { id: row.overrideId, variant } };
	},
	async record(record) {
		await insertTrace(record);
	},
};
