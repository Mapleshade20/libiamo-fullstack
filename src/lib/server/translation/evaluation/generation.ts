import type { ChatMessage } from "$lib/server/llm/client";
import { defineLlmRecipe } from "$lib/server/llm/recipe";
import { type LlmRecipeResponse, type LlmSubjects, runLlmRecipe } from "$lib/server/llm/run";
import { buildGeneration1Messages, type Generation1Input } from "./prompt";
import { Generation1Schema } from "./schema";
import { TranslationEvaluationContractError, type ValidatedGeneration1Evaluation, validateGeneration1Evaluation } from "./validation";

type Generation1RecipeInput = Generation1Input & {
	/** Optional caller-controlled sampling temperature for approved development tooling. */
	temperature?: number;
};

export type GenerateTranslationEvaluationInput = Generation1RecipeInput & {
	userId?: string;
	subjects?: LlmSubjects;
};

export type TranslationEvaluationResponse = LlmRecipeResponse<ValidatedGeneration1Evaluation> & {
	history: ChatMessage[];
};

function validateInput(input: GenerateTranslationEvaluationInput): void {
	const count = input.sourceParagraphs.length;
	if (count === 0 || input.sourceParagraphs.some((paragraph) => !paragraph.trim())) {
		throw new TranslationEvaluationContractError("Generation 1 requires non-empty source paragraphs.");
	}
	if (input.learnerParagraphs.length !== count || input.learnerParagraphs.some((paragraph) => !paragraph.trim())) {
		throw new TranslationEvaluationContractError("Generation 1 requires one non-empty learner answer per source paragraph.");
	}
	if (input.referenceParagraphs.length !== count || input.referenceParagraphs.some((reference) => !reference.trim())) {
		throw new TranslationEvaluationContractError("Generation 1 requires one non-empty authentic reference for every source paragraph.");
	}
	if (!input.context.trim()) throw new TranslationEvaluationContractError("Generation 1 requires non-empty scenario context.");
	if (![input.sourceLanguage, input.targetLanguage, input.feedbackLanguage].every((language) => language.trim())) {
		throw new TranslationEvaluationContractError("Generation 1 requires explicit source, target, and feedback languages.");
	}
	if (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) {
		throw new TranslationEvaluationContractError("Generation 1 temperature must be a finite number between 0 and 2.");
	}
}

export const generation1Recipe = defineLlmRecipe({
	id: "translation.generation-1",
	version: 1,
	title: "Translation evaluation (Generation 1)",
	reasoningEffort: "medium",
	output: { kind: "json", schema: Generation1Schema },
	build: (input: Generation1RecipeInput) => buildGeneration1Messages(input),
	options: (input) => ({ temperature: input.temperature ?? 0.4 }),
	finalize: (value, input) => validateGeneration1Evaluation(value, input),
});

export async function generateTranslationEvaluation(input: GenerateTranslationEvaluationInput): Promise<TranslationEvaluationResponse> {
	validateInput(input);
	const { userId, subjects, ...recipeInput } = input;
	const response = await runLlmRecipe(generation1Recipe, recipeInput, { userId, subjects });
	return {
		...response,
		history: [...response.requestMessages, { role: "assistant", content: response.content }],
	};
}
