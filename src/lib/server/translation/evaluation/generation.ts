import { type ChatMessage, chatJson, type JsonChatResponse } from "$lib/server/llm";
import { buildGeneration1Messages, type Generation1Input } from "./prompt";
import { Generation1Schema } from "./schema";
import { TranslationEvaluationContractError, type ValidatedGeneration1Evaluation, validateGeneration1Evaluation } from "./validation";

export type GenerateTranslationEvaluationInput = Generation1Input & {
	userId?: string;
	/** Optional caller-controlled sampling temperature for approved development tooling. */
	temperature?: number;
};

export type TranslationEvaluationResponse = JsonChatResponse<ValidatedGeneration1Evaluation> & {
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

export async function generateTranslationEvaluation(input: GenerateTranslationEvaluationInput): Promise<TranslationEvaluationResponse> {
	validateInput(input);
	const messages = buildGeneration1Messages(input);
	const response = await chatJson({
		schema: Generation1Schema,
		messages,
		options: { temperature: input.temperature ?? 0.4, maxTokens: 32_768 },
		userId: input.userId,
	});
	const value = validateGeneration1Evaluation(response.value, input);
	return {
		...response,
		value,
		history: [...response.requestMessages, { role: "assistant", content: response.content }],
	};
}
