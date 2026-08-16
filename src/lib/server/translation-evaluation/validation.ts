import { type MarkedTextPart, parseMarkedText } from "$lib/marked-text";
import type { TranslationCardWarning, TranslationDiffPart } from "$lib/translation-evaluation/types";
import { parseTranslationDiff } from "./diff";
import type { Generation1Evaluation, Generation2Result, SecondDraftVerification } from "./schema";

export class TranslationEvaluationContractError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TranslationEvaluationContractError";
	}
}

export type TextRange = { start: number; end: number };

export type ValidatedGeneration1Card = Generation1Evaluation["cards"][number] & {
	ordinal: number;
	sourceRange: TextRange | null;
	answerRange: TextRange | null;
	minimalDiffParts: TranslationDiffPart[] | null;
	referenceMarkedParts: MarkedTextPart[] | null;
	warnings: TranslationCardWarning[];
};

export type ValidatedGeneration1Evaluation = Omit<Generation1Evaluation, "cards"> & {
	cards: ValidatedGeneration1Card[];
};

function rangesOverlap(left: TextRange, right: TextRange): boolean {
	return left.start < right.end && right.start < left.end;
}

function occurrences(haystack: string, needle: string): TextRange[] {
	const ranges: TextRange[] = [];
	let from = 0;
	while (from <= haystack.length - needle.length) {
		const start = haystack.indexOf(needle, from);
		if (start === -1) break;
		ranges.push({ start, end: start + needle.length });
		from = start + 1;
	}
	return ranges;
}

/** Assign exact matches longest-first so repeated and nested card text never shares a span. */
export function assignNonOverlappingRanges(haystack: string, needles: string[]): Array<TextRange | null> {
	const assigned: Array<TextRange | null> = Array.from({ length: needles.length }, () => null);
	const used: TextRange[] = [];
	const order = needles.map((needle, index) => ({ needle, index })).sort((a, b) => b.needle.length - a.needle.length || a.index - b.index);

	for (const item of order) {
		const match = occurrences(haystack, item.needle).find((candidate) => used.every((range) => !rangesOverlap(candidate, range)));
		if (!match) continue;
		assigned[item.index] = match;
		used.push(match);
	}

	return assigned;
}

export function validateGeneration1Evaluation(
	evaluation: Generation1Evaluation,
	input: { sourceParagraphs: string[]; learnerParagraphs: string[] },
): ValidatedGeneration1Evaluation {
	if (input.sourceParagraphs.length === 0 || input.sourceParagraphs.some((paragraph) => !paragraph.trim())) {
		throw new TranslationEvaluationContractError("Generation 1 requires non-empty source paragraphs.");
	}
	if (input.learnerParagraphs.length !== input.sourceParagraphs.length || input.learnerParagraphs.some((paragraph) => !paragraph.trim())) {
		throw new TranslationEvaluationContractError("Generation 1 requires one non-empty learner answer per source paragraph.");
	}

	const sourceRanges = assignNonOverlappingRanges(
		input.sourceParagraphs.join("\n\n"),
		evaluation.cards.map((card) => card.sourceText),
	);
	const answerRanges = assignNonOverlappingRanges(
		input.learnerParagraphs.join("\n\n"),
		evaluation.cards.map((card) => card.originalAnswer),
	);
	const duplicateCounts = new Map<string, number>();
	for (const card of evaluation.cards) {
		const key = JSON.stringify([card.sourceText, card.originalAnswer]);
		duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
	}

	return {
		...evaluation,
		cards: evaluation.cards.map((card, ordinal) => {
			const warnings: TranslationCardWarning[] = [];
			const minimalDiff = parseTranslationDiff(card.minimalDiff);
			const referenceMarked = parseMarkedText(card.referenceMarked);
			if (!sourceRanges[ordinal]) warnings.push("source_unmatched");
			if (!answerRanges[ordinal]) warnings.push("answer_unmatched");
			if ((duplicateCounts.get(JSON.stringify([card.sourceText, card.originalAnswer])) ?? 0) > 1) warnings.push("duplicate");
			if (!minimalDiff.success) warnings.push("minimal_diff_invalid");
			if (!referenceMarked.success) warnings.push("reference_marked_invalid");
			return {
				...card,
				ordinal,
				sourceRange: sourceRanges[ordinal],
				answerRange: answerRanges[ordinal],
				minimalDiffParts: minimalDiff.success ? minimalDiff.parts : null,
				referenceMarkedParts: referenceMarked.success ? referenceMarked.parts : null,
				warnings,
			};
		}),
	};
}

export function assertExactOrdinalCoverage(ordinals: number[], cardCount: number, label: string): void {
	if (!Number.isInteger(cardCount) || cardCount < 0) {
		throw new TranslationEvaluationContractError(`${label} received an invalid card count.`);
	}
	const expected = Array.from({ length: cardCount }, (_, ordinal) => ordinal);
	const actual = [...ordinals].sort((a, b) => a - b);
	if (actual.length !== expected.length || actual.some((ordinal, index) => ordinal !== expected[index])) {
		throw new TranslationEvaluationContractError(`${label} must cover every card ordinal exactly once.`);
	}
}

export function validateSecondDraftVerification(result: SecondDraftVerification, cardCount: number): SecondDraftVerification {
	assertExactOrdinalCoverage(
		result.cards.map((card) => card.ordinal),
		cardCount,
		"Second-draft verification",
	);
	return { ...result, cards: [...result.cards].sort((a, b) => a.ordinal - b.ordinal) };
}

export function validateGeneration2Result(result: Generation2Result, cardCount: number): Generation2Result {
	if (cardCount < 1) throw new TranslationEvaluationContractError("Generation 2 requires at least one correction card.");
	assertExactOrdinalCoverage(
		result.notes.flatMap((note) => note.sourceCardOrdinals),
		cardCount,
		"Generation 2",
	);

	for (const note of result.notes) {
		const examples = new Set(note.examples.map((example) => `${example.targetText.trim()}\u0000${example.nativeText.trim()}`));
		if (examples.size !== note.examples.length) {
			throw new TranslationEvaluationContractError("Each generated note must contain four distinct examples.");
		}
	}
	return result;
}
