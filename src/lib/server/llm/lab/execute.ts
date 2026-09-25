import type { LabJudgeResult, LabRunJudge } from "$lib/llm/lab";
import type { AnyLlmRecipe } from "../recipe";
import { executeLlmRecipe, type LlmCallRecord, type LlmVariant } from "../run";
import { judgeRecipe } from "./judge";
import { insertTrace } from "./traces";
import { resolveVariant } from "./variants";

export type LabCallResult = { traceId: string; record: LlmCallRecord };

/**
 * Runs a recipe for the Lab and stores its trace before returning. Model failures are results,
 * not errors: they come back in `record.error`. Recipes are pure, so nothing but the trace is written.
 */
export async function runLabCall(
	recipe: AnyLlmRecipe,
	input: unknown,
	variant: LlmVariant,
	actorId: string,
	owner: { label: string; runId?: number },
): Promise<LabCallResult> {
	let captured: LlmCallRecord | null = null;
	try {
		await executeLlmRecipe(recipe, input, {
			userId: actorId,
			origin: "lab",
			variant,
			capture: true,
			recorder: (record) => {
				captured = record;
			},
		});
	} catch (error) {
		// Build or template errors fail before any record exists.
		if (!captured) throw error;
	}
	const record = captured as unknown as LlmCallRecord;
	const traceId = await insertTrace(record, owner);
	return { traceId, record };
}

export async function judgeLabOutput(input: {
	judge: LabRunJudge;
	recipe: AnyLlmRecipe;
	record: LlmCallRecord;
	actorId: string;
	runId: number;
}): Promise<LabJudgeResult> {
	try {
		const variant = await resolveVariant({ providerRef: input.judge.providerRef, temperature: null }, input.actorId);
		const { traceId, record } = await runLabCall(
			judgeRecipe,
			{
				rubric: input.judge.rubric,
				recipeTitle: input.recipe.title,
				request: input.record.messages,
				output: input.record.value ?? input.record.response?.content ?? null,
			},
			variant,
			input.actorId,
			{ label: "judge", runId: input.runId },
		);
		if (record.error || !record.value) return { error: record.error instanceof Error ? record.error.message : "The judge failed.", traceId };
		const verdict = record.value as { score: number; rationale: string };
		return { score: verdict.score, rationale: verdict.rationale, traceId };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}
