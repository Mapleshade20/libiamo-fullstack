import { and, asc, eq } from "drizzle-orm";
import type { ReasoningEffort } from "$lib/constants";
import type { ProviderRef } from "$lib/llm/lab";
import { db } from "$lib/server/db";
import { llmOverride } from "$lib/server/db/schema";
import { isProviderRef } from "../providers";
import { LabInputError } from "./datasets";
import { findRecipe } from "./recipes";
import { effectiveSlotOverrides, slotOverrideProblems } from "./variants";

export async function listOverrides(userId: string) {
	return db.select().from(llmOverride).where(eq(llmOverride.userId, userId)).orderBy(asc(llmOverride.recipeId));
}

export async function countActiveOverrides(userId: string): Promise<number> {
	const rows = await db
		.select({ id: llmOverride.id })
		.from(llmOverride)
		.where(and(eq(llmOverride.userId, userId), eq(llmOverride.enabled, true)));
	return rows.length;
}

export async function saveOverride(input: {
	userId: string;
	recipeId: string;
	enabled: boolean;
	slots: Record<string, string>;
	providerRef: ProviderRef | null;
	temperature: number | null;
	reasoningEffort: ReasoningEffort | null;
	note: string;
}) {
	const recipe = findRecipe(input.recipeId);
	if (!recipe) throw new LabInputError("Unknown recipe.");
	const slots = effectiveSlotOverrides(recipe, input.slots);
	const problems = slotOverrideProblems(recipe, slots);
	if (problems.length) throw new LabInputError(problems.join(" "));
	if (input.providerRef !== null && !isProviderRef(input.providerRef)) throw new LabInputError("Unknown provider.");
	const values = { ...input, slots, updatedAt: new Date() };
	await db
		.insert(llmOverride)
		.values(values)
		.onConflictDoUpdate({
			target: [llmOverride.userId, llmOverride.recipeId],
			set: {
				enabled: values.enabled,
				slots,
				providerRef: values.providerRef,
				temperature: values.temperature,
				reasoningEffort: values.reasoningEffort,
				note: values.note,
				updatedAt: values.updatedAt,
			},
		});
}

export async function deleteOverride(userId: string, recipeId: string) {
	await db.delete(llmOverride).where(and(eq(llmOverride.userId, userId), eq(llmOverride.recipeId, recipeId)));
}
