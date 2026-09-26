import { defineLlmRecipe } from "$lib/server/llm/recipe";
import { type LlmRecipeResponse, type LlmSubjects, runLlmRecipe } from "$lib/server/llm/run";
import type { TranslationDiffPart } from "$lib/translation/evaluation";
import { parseTranslationDiff } from "./diff";
import {
	buildCorrectionVerifierMessages,
	buildSecondDraftVerifierMessages,
	type CorrectionVerifierInput,
	type SecondDraftVerifierInput,
} from "./prompt";
import { type CorrectionVerification, CorrectionVerifierSchema, type SecondDraftVerification, SecondDraftVerifierSchema } from "./schema";
import { assertExactOrdinalCoverage, TranslationEvaluationContractError, validateSecondDraftVerification } from "./validation";

export type ValidatedCorrectionVerification =
	| Extract<CorrectionVerification, { verdict: "reject" }>
	| (Extract<CorrectionVerification, { verdict: "accept" }> & {
			acceptedDiffParts: TranslationDiffPart[] | null;
			acceptedDiffWarning: "accepted_diff_invalid" | null;
	  });

function assertHistory(history: SecondDraftVerifierInput["generation1History"]): void {
	if (history.length === 0 || history.at(-1)?.role !== "assistant") {
		throw new TranslationEvaluationContractError("Verifier requires the successful Generation 1 conversation.");
	}
}

function assertLanguages(targetLanguage: string, feedbackLanguage: string): void {
	if (!targetLanguage.trim() || !feedbackLanguage.trim()) {
		throw new TranslationEvaluationContractError("Verifier requires explicit target and feedback languages.");
	}
}

type CallContext = { userId?: string; subjects?: LlmSubjects };

export const correctionVerifierRecipe = defineLlmRecipe({
	id: "translation.correction-verifier",
	version: 1,
	title: "Correction Verifier",
	reasoningEffort: "medium",
	output: { kind: "json", schema: CorrectionVerifierSchema },
	build: (input: CorrectionVerifierInput) => buildCorrectionVerifierMessages(input),
	options: { temperature: 0.2 },
	finalize: (value): ValidatedCorrectionVerification => {
		if (value.verdict === "reject") return value;
		const parsedDiff = parseTranslationDiff(value.acceptedDiff);
		return {
			...value,
			acceptedDiffParts: parsedDiff.success ? parsedDiff.parts : null,
			acceptedDiffWarning: parsedDiff.success ? null : "accepted_diff_invalid",
		};
	},
});

export const secondDraftVerifierRecipe = defineLlmRecipe({
	id: "translation.second-draft-verifier",
	version: 1,
	title: "Second Draft Verifier",
	reasoningEffort: "medium",
	output: { kind: "json", schema: SecondDraftVerifierSchema },
	build: (input: SecondDraftVerifierInput) => buildSecondDraftVerifierMessages(input),
	options: { temperature: 0.2 },
	finalize: (value, input) => validateSecondDraftVerification(value, input.cardCount),
});

export async function verifyCorrection(input: CorrectionVerifierInput & CallContext): Promise<LlmRecipeResponse<ValidatedCorrectionVerification>> {
	assertLanguages(input.targetLanguage, input.feedbackLanguage);
	if (!input.learnerRevision.trim()) throw new TranslationEvaluationContractError("Correction revision must not be empty.");
	const { userId, subjects, ...recipeInput } = input;
	return runLlmRecipe(correctionVerifierRecipe, recipeInput, { userId, subjects });
}

export async function verifySecondDraft(input: SecondDraftVerifierInput & CallContext): Promise<LlmRecipeResponse<SecondDraftVerification>> {
	assertHistory(input.generation1History);
	assertLanguages(input.targetLanguage, input.feedbackLanguage);
	if (input.secondDraftParagraphs.length === 0 || input.secondDraftParagraphs.some((paragraph) => !paragraph.trim())) {
		throw new TranslationEvaluationContractError("Second draft must contain non-empty paragraphs.");
	}
	assertExactOrdinalCoverage(
		input.cardOutcomes.map((card) => card.ordinal),
		input.cardCount,
		"Second-draft card outcomes",
	);
	const { userId, subjects, ...recipeInput } = input;
	return runLlmRecipe(secondDraftVerifierRecipe, recipeInput, { userId, subjects });
}
