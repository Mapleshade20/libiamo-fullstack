import type { ReasoningEffort } from "$lib/constants";
import type { LabVariantSpec, ProviderRef } from "$lib/llm/lab";
import { unknownTemplateVariables } from "$lib/llm/template";
import type { ChatOptions } from "../client";
import { resolveProviderRef } from "../providers";
import type { AnyLlmRecipe } from "../recipe";
import type { LlmVariant } from "../run";

/** Problems with slot overrides for a recipe; empty when they are usable. */
export function slotOverrideProblems(recipe: AnyLlmRecipe, slots: Readonly<Record<string, string>>): string[] {
	const problems: string[] = [];
	for (const [name, template] of Object.entries(slots)) {
		const slot = recipe.slots?.[name];
		if (!slot) {
			problems.push(`${recipe.id} has no slot "${name}".`);
			continue;
		}
		if (!template.trim()) problems.push(`Slot "${name}" is empty.`);
		const unknown = unknownTemplateVariables(template, slot.variables);
		if (unknown.length) problems.push(`Slot "${name}" uses unknown variables: ${unknown.map((variable) => `{{${variable}}}`).join(", ")}.`);
	}
	return problems;
}

/** Slot overrides that differ from the defaults; unchanged slots are dropped so traces show only real edits. */
export function effectiveSlotOverrides(recipe: AnyLlmRecipe, slots: Readonly<Record<string, string>>): Record<string, string> {
	return Object.fromEntries(Object.entries(slots).filter(([name, template]) => recipe.slots?.[name] && recipe.slots[name].template !== template));
}

export const MAX_RUN_CELLS = 600;

/** Every case × variant × repeat of a run, in display order. */
export function expandRunCells(caseIds: number[], variants: Pick<LabVariantSpec, "key">[], repeats: number) {
	return caseIds.flatMap((caseId) =>
		variants.flatMap((variant) => Array.from({ length: repeats }, (_, repeatIndex) => ({ caseId, variantKey: variant.key, repeatIndex }))),
	);
}

export async function resolveVariant(
	spec: { slots?: Record<string, string>; providerRef: ProviderRef; temperature: number | null; reasoningEffort?: ReasoningEffort | null },
	actorId: string,
	messages?: LlmVariant["messages"],
): Promise<LlmVariant> {
	const options: ChatOptions = {
		...(spec.temperature === null ? {} : { temperature: spec.temperature }),
		...(spec.reasoningEffort ? { reasoningEffort: spec.reasoningEffort } : {}),
	};
	return {
		...(spec.slots && Object.keys(spec.slots).length ? { slots: spec.slots } : {}),
		provider: await resolveProviderRef(spec.providerRef, actorId),
		...(Object.keys(options).length ? { options } : {}),
		...(messages ? { messages } : {}),
	};
}
