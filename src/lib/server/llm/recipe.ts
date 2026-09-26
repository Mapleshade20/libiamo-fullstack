import type { z } from "zod";
import type { ReasoningEffort } from "$lib/constants";
import { fillTemplate, TemplateError } from "$lib/llm/template";
import type { ChatMessage, ChatOptions } from "./client";

/**
 * A declared LLM call. `build` and `finalize` are pure functions of a JSON-plain input, so a
 * captured input can be stored and re-run later (LLM Lab) with other slots, providers or options.
 * Call sites keep their DB reads and side effects; a recipe never writes domain state.
 */
export type LlmRecipe<I, P = unknown, O = P> = {
	/** Stable `<domain>.<call>` identifier. */
	id: string;
	/** Bump when the input shape changes incompatibly, so stored inputs can be flagged. */
	version: number;
	title: string;
	output: LlmRecipeOutput<P>;
	/** Editable prompt prose; `build` renders each through the slot renderer. */
	slots?: Readonly<Record<string, LlmSlotDefinition>>;
	build(input: I, slots: SlotRenderer): ChatMessage[];
	/** Thinking is always on: `low` for light, latency-sensitive calls, `medium` for judgement-heavy ones. */
	reasoningEffort: ReasoningEffort;
	options?: ChatOptions | ((input: I) => ChatOptions);
	/** Pure validation or transformation of the parsed value; throw to reject it. */
	finalize?(value: P, input: I): O;
};

export type LlmRecipeOutput<P> = { kind: "json"; schema: z.ZodType<P> } | { kind: "text"; parse(content: string): P };

export type LlmSlotDefinition = {
	label: string;
	/** Default prose; must render exactly today's prompt. */
	template: string;
	/** The placeholders `build` provides for this slot. */
	variables: readonly string[];
};

/** Renders a slot (its override or its default template) with the given variables. */
export type SlotRenderer = (name: string, variables: Readonly<Record<string, string>>) => string;

/** A recipe of any input and output type, as held by a registry. */
export type AnyLlmRecipe = LlmRecipe<any, any, any>;

export type LlmRecipeOutputType<R> = R extends LlmRecipe<never, unknown, infer O> ? O : never;

export function defineLlmRecipe<I, P, O = P>(recipe: LlmRecipe<I, P, O>): LlmRecipe<I, P, O> {
	return recipe;
}

export function createSlotRenderer(recipe: Pick<AnyLlmRecipe, "id" | "slots">, overrides: Readonly<Record<string, string>> = {}): SlotRenderer {
	return (name, variables) => {
		const slot = recipe.slots?.[name];
		if (!slot) throw new TemplateError(`Recipe ${recipe.id} has no slot "${name}".`);
		return fillTemplate(overrides[name] ?? slot.template, variables);
	};
}

export function recipeOptions<I>(recipe: LlmRecipe<I, unknown, unknown>, input: I): ChatOptions {
	return { reasoningEffort: recipe.reasoningEffort, ...(typeof recipe.options === "function" ? recipe.options(input) : recipe.options) };
}

/** The messages a recipe sends for this input and these slot overrides. */
export function buildRecipeMessages<I>(recipe: LlmRecipe<I, unknown, unknown>, input: I, slots?: Readonly<Record<string, string>>): ChatMessage[] {
	return recipe.build(input, createSlotRenderer(recipe, slots));
}
