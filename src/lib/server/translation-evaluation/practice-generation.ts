import { chatJson, type JsonChatResponse } from "$lib/server/llm";
import { buildGeneration2Messages, type Generation2Input } from "./prompt";
import { type Generation2Result, Generation2Schema } from "./schema";
import { assertExactOrdinalCoverage, TranslationEvaluationContractError, validateGeneration2Result } from "./validation";

export async function generateTranslationPractice(input: Generation2Input & { userId?: string }): Promise<JsonChatResponse<Generation2Result>> {
	if (input.cards.length === 0) throw new TranslationEvaluationContractError("Generation 2 requires at least one correction card.");
	if (![input.sourceLanguage, input.targetLanguage, input.feedbackLanguage].every((language) => language.trim())) {
		throw new TranslationEvaluationContractError("Generation 2 requires explicit source, target, and feedback languages.");
	}
	assertExactOrdinalCoverage(
		input.cards.map((card) => card.ordinal),
		input.cards.length,
		"Generation 2 input",
	);
	const response = await chatJson({
		schema: Generation2Schema,
		messages: buildGeneration2Messages(input),
		options: { temperature: 0.6, maxTokens: 32_768 },
		userId: input.userId,
	});
	return { ...response, value: validateGeneration2Result(response.value, input.cards.length) };
}
