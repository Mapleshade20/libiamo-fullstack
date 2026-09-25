import { defineLlmRecipe } from "$lib/server/llm/recipe";
import { type LlmRecipeResponse, type LlmSubjects, runLlmRecipe } from "$lib/server/llm/run";
import { buildGeneration2Messages, type Generation2Input } from "./prompt";
import { type Generation2Result, Generation2Schema } from "./schema";
import { assertExactOrdinalCoverage, TranslationEvaluationContractError, validateGeneration2Result } from "./validation";

export const GENERATION_2_TEMPERATURE = 0.6;

export const generation2Recipe = defineLlmRecipe({
	id: "translation.generation-2",
	version: 1,
	title: "Translation practice Notes (Generation 2)",
	reasoningEffort: "medium",
	output: { kind: "json", schema: Generation2Schema },
	build: (input: Generation2Input) => buildGeneration2Messages(input),
	options: { temperature: GENERATION_2_TEMPERATURE },
	finalize: (value, input): Generation2Result => validateGeneration2Result(value, input.cards.length),
});

export async function generateTranslationPractice(
	input: Generation2Input & { userId?: string; subjects?: LlmSubjects },
): Promise<LlmRecipeResponse<Generation2Result>> {
	if (input.cards.length === 0) throw new TranslationEvaluationContractError("Generation 2 requires at least one correction card.");
	if (![input.sourceLanguage, input.targetLanguage].every((language) => language.trim())) {
		throw new TranslationEvaluationContractError("Generation 2 requires explicit native and target languages.");
	}
	assertExactOrdinalCoverage(
		input.cards.map((card) => card.ordinal),
		input.cards.length,
		"Generation 2 input",
	);
	const { userId, subjects, ...recipeInput } = input;
	return runLlmRecipe(generation2Recipe, recipeInput, { userId, subjects });
}
