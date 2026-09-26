import { API_DEFAULT_TEMPERATURE, type RecipeDescriptor } from "$lib/llm/lab";
import { agentReplyRecipe } from "$lib/server/practice/agent-replies/generator";
import { feedbackAnnotationRecipe, followUpRecipe } from "$lib/server/practice/feedback";
import { contentHintRecipe, expressionHintRecipe } from "$lib/server/practice/hints";
import { expressionsRecipe, translationFeedbackRecipe } from "$lib/server/practice/translation-help";
import { noteGenerationRecipe } from "$lib/server/review/notes";
import { generation1Recipe } from "$lib/server/translation/evaluation/generation";
import { generation2Recipe } from "$lib/server/translation/evaluation/practice-generation";
import { correctionVerifierRecipe, secondDraftVerifierRecipe } from "$lib/server/translation/evaluation/verifier";
import { translationCandidatesRecipe } from "$lib/server/translation/sources";
import type { AnyLlmRecipe } from "../recipe";
import { judgeRecipe } from "./judge";

/**
 * Every recipe the Lab can inspect and re-run. Only Lab code imports this registry, so product
 * modules never depend on Lab code.
 */
export const LLM_RECIPES: readonly AnyLlmRecipe[] = [
	agentReplyRecipe,
	contentHintRecipe,
	expressionHintRecipe,
	feedbackAnnotationRecipe,
	followUpRecipe,
	expressionsRecipe,
	translationFeedbackRecipe,
	noteGenerationRecipe,
	translationCandidatesRecipe,
	generation1Recipe,
	correctionVerifierRecipe,
	secondDraftVerifierRecipe,
	generation2Recipe,
	judgeRecipe,
];

const byId = new Map(LLM_RECIPES.map((recipe) => [recipe.id, recipe]));

export function findRecipe(id: string): AnyLlmRecipe | null {
	return byId.get(id) ?? null;
}

/**
 * The temperature a recipe sends when nothing overrides it. Input-dependent options are read with an
 * empty input, which yields their fallback.
 */
function defaultTemperature(recipe: AnyLlmRecipe): RecipeDescriptor["defaultTemperature"] {
	let temperature: number | undefined;
	try {
		temperature = (typeof recipe.options === "function" ? recipe.options({}) : recipe.options)?.temperature;
	} catch {
		temperature = undefined;
	}
	return temperature === undefined ? { value: API_DEFAULT_TEMPERATURE, source: "api" } : { value: temperature, source: "recipe" };
}

export function describeRecipe(recipe: AnyLlmRecipe): RecipeDescriptor {
	return {
		id: recipe.id,
		version: recipe.version,
		title: recipe.title,
		outputKind: recipe.output.kind,
		reasoningEffort: recipe.reasoningEffort,
		defaultTemperature: defaultTemperature(recipe),
		slots: Object.entries(recipe.slots ?? {}).map(([name, slot]) => ({
			name,
			label: slot.label,
			template: slot.template,
			variables: [...slot.variables],
		})),
	};
}

export function describeRecipes(): RecipeDescriptor[] {
	return LLM_RECIPES.map(describeRecipe);
}
