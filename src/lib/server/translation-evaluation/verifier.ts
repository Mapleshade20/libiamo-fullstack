import { chatJson, type JsonChatResponse } from "$lib/server/llm";
import type { TranslationDiffPart } from "$lib/translation-evaluation/types";
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

export async function verifyCorrection(
	input: CorrectionVerifierInput & { userId?: string },
): Promise<JsonChatResponse<ValidatedCorrectionVerification>> {
	assertLanguages(input.targetLanguage, input.feedbackLanguage);
	if (!input.learnerRevision.trim()) throw new TranslationEvaluationContractError("Correction revision must not be empty.");
	const response = await chatJson({
		schema: CorrectionVerifierSchema,
		messages: buildCorrectionVerifierMessages(input),
		options: { temperature: 0.2 },
		userId: input.userId,
	});
	if (response.value.verdict === "reject") return { ...response, value: response.value };
	const parsedDiff = parseTranslationDiff(response.value.acceptedDiff);
	return {
		...response,
		value: {
			...response.value,
			acceptedDiffParts: parsedDiff.success ? parsedDiff.parts : null,
			acceptedDiffWarning: parsedDiff.success ? null : "accepted_diff_invalid",
		},
	};
}

export async function verifySecondDraft(input: SecondDraftVerifierInput & { userId?: string }): Promise<JsonChatResponse<SecondDraftVerification>> {
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
	const response = await chatJson({
		schema: SecondDraftVerifierSchema,
		messages: buildSecondDraftVerifierMessages(input),
		options: { temperature: 0.2 },
		userId: input.userId,
	});
	return { ...response, value: validateSecondDraftVerification(response.value, input.cardCount) };
}
