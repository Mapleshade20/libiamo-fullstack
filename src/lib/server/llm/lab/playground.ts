import type { ReasoningEffort } from "$lib/constants";
import type { LabChatMessage, ProviderRef } from "$lib/llm/lab";
import type { ChatMessage } from "../client";
import { buildRecipeMessages } from "../recipe";
import { LabInputError } from "./datasets";
import { runLabCall } from "./execute";
import { findRecipe } from "./recipes";
import { effectiveSlotOverrides, resolveVariant, slotOverrideProblems } from "./variants";

export type PlaygroundRequest = {
	recipeId: string;
	input: unknown;
	slots: Record<string, string>;
	providerRef: ProviderRef;
	temperature: number | null;
	reasoningEffort: ReasoningEffort | null;
	/** When set, sent as-is instead of the messages the recipe builds. */
	messages: LabChatMessage[] | null;
};

function recipeFor(recipeId: string, slots: Record<string, string>) {
	const recipe = findRecipe(recipeId);
	if (!recipe) throw new LabInputError("Unknown recipe.");
	const effective = effectiveSlotOverrides(recipe, slots);
	const problems = slotOverrideProblems(recipe, effective);
	if (problems.length) throw new LabInputError(problems.join(" "));
	return { recipe, slots: effective };
}

/** The messages the recipe would send, without calling a model. */
export function previewMessages(recipeId: string, input: unknown, slots: Record<string, string>): ChatMessage[] {
	const { recipe, slots: effective } = recipeFor(recipeId, slots);
	try {
		return buildRecipeMessages(recipe, input, effective);
	} catch (error) {
		throw new LabInputError(`The input does not fit ${recipe.id}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

export async function runPlayground(request: PlaygroundRequest, actorId: string): Promise<string> {
	const { recipe, slots } = recipeFor(request.recipeId, request.slots);
	const variant = await resolveVariant(
		{ slots, providerRef: request.providerRef, temperature: request.temperature, reasoningEffort: request.reasoningEffort },
		actorId,
		request.messages ?? undefined,
	);
	try {
		const { traceId } = await runLabCall(recipe, request.input, variant, actorId, { label: "playground" });
		return traceId;
	} catch (error) {
		throw new LabInputError(`The input does not fit ${recipe.id}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
