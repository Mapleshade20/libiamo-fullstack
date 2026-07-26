import type { EvaluationData } from "$lib/components/translate-evaluation/types";
import type { ChatMessage, ChatUsage } from "$lib/server/llm";
import { LIVE_DEMO_TEMPERATURE } from "$lib/translation-evaluation/live-demo-fixture";
import { TRANSLATION_GRADES, TRANSLATION_RATING_KEYS } from "$lib/translation-evaluation/types";

export const LIVE_REVIEW_STORAGE_KEY = "libiamo.translate-eval-live-demo.review.v5";
export const LIVE_TEMPERATURE_STORAGE_KEY = "libiamo.translate-eval-live-demo.temperature.v1";
export const DEPRECATED_LIVE_REVIEW_STORAGE_KEYS = [
	"libiamo.translate-eval-live-demo.review.v1",
	"libiamo.translate-eval-live-demo.review.v2",
	"libiamo.translate-eval-live-demo.review.v3",
	"libiamo.translate-eval-live-demo.review.v4",
] as const;

export type GenerationMetadata = {
	temperature: number;
	model: string | null;
	finishReason: string | null;
	usage: ChatUsage | null;
	durationMs: number;
	repairUsed: boolean;
};

export type PersistedReview = {
	version: 5;
	learnerParagraphs: string[];
	promptMessages: ChatMessage[];
	rawResponse: string | null;
	metadata: GenerationMetadata | null;
	evaluation: EvaluationData;
	reviewView: "overview" | "card";
	cardIndex: number;
	revealGeneratedAnswers: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isChatMessages(value: unknown): value is ChatMessage[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every(
			(message) =>
				isRecord(message) &&
				(message.role === "system" || message.role === "user" || message.role === "assistant") &&
				typeof message.content === "string",
		)
	);
}

function isDiffParts(value: unknown): boolean {
	return (
		value === null ||
		(Array.isArray(value) &&
			value.every(
				(part) =>
					isRecord(part) &&
					((part.type === "replace" && typeof part.from === "string" && typeof part.to === "string") ||
						((part.type === "unchanged" || part.type === "delete" || part.type === "add") && typeof part.text === "string")),
			))
	);
}

function isMarkedTextParts(value: unknown): boolean {
	return (
		value === null ||
		(Array.isArray(value) &&
			value.every(
				(part) => isRecord(part) && (part.type === "text" || part.type === "mark") && typeof part.content === "string" && part.content.length > 0,
			))
	);
}

function isEvaluationData(value: unknown, expectedParagraphCount: number): value is EvaluationData {
	if (!isRecord(value) || typeof value.overallCommentary !== "string" || !isRecord(value.ratings) || !Array.isArray(value.cards)) return false;
	if (
		typeof value.firstDraft !== "string" ||
		!isStringArray(value.firstDraftParagraphs) ||
		value.firstDraftParagraphs.length !== expectedParagraphCount ||
		!isStringArray(value.sourceParagraphs) ||
		value.sourceParagraphs.length !== expectedParagraphCount
	) {
		return false;
	}
	const ratings = value.ratings;
	if (
		Object.keys(ratings).length !== TRANSLATION_RATING_KEYS.length ||
		!TRANSLATION_RATING_KEYS.every((key) => TRANSLATION_GRADES.includes(ratings[key] as (typeof TRANSLATION_GRADES)[number]))
	) {
		return false;
	}

	return value.cards.every(
		(card) =>
			isRecord(card) &&
			Number.isInteger(card.ordinal) &&
			typeof card.ordinal === "number" &&
			card.ordinal >= 0 &&
			["sourceText", "originalAnswer", "initialHint", "deeperHint", "referenceAnswer", "minimalAnswer"].every(
				(key) => typeof card[key] === "string",
			) &&
			isDiffParts(card.minimalDiff) &&
			isMarkedTextParts(card.referenceMarked) &&
			isStringArray(card.teacherNotes) &&
			isStringArray(card.warnings),
	);
}

function isOptionalTokenCount(value: unknown): boolean {
	return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isMetadata(value: unknown): value is GenerationMetadata | null {
	if (value === null) return true;
	if (
		!isRecord(value) ||
		!isLiveDemoTemperature(value.temperature) ||
		!(value.model === null || typeof value.model === "string") ||
		!(value.finishReason === null || typeof value.finishReason === "string") ||
		!Number.isFinite(value.durationMs) ||
		typeof value.repairUsed !== "boolean"
	) {
		return false;
	}
	if (value.usage === null) return true;
	return (
		isRecord(value.usage) &&
		isOptionalTokenCount(value.usage.promptTokens) &&
		isOptionalTokenCount(value.usage.completionTokens) &&
		isOptionalTokenCount(value.usage.totalTokens)
	);
}

export function isLiveDemoTemperature(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= LIVE_DEMO_TEMPERATURE.min && value <= LIVE_DEMO_TEMPERATURE.max;
}

export function parseLiveDemoTemperature(raw: string | null): number | null {
	if (raw === null || !raw.trim()) return null;
	const value = Number(raw);
	return isLiveDemoTemperature(value) ? value : null;
}

export function parsePersistedReview(raw: string, expectedParagraphCount: number): PersistedReview | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (
			!isRecord(value) ||
			value.version !== 5 ||
			!isStringArray(value.learnerParagraphs) ||
			value.learnerParagraphs.length !== expectedParagraphCount ||
			!isChatMessages(value.promptMessages) ||
			!(value.rawResponse === null || typeof value.rawResponse === "string") ||
			!isMetadata(value.metadata) ||
			!isEvaluationData(value.evaluation, expectedParagraphCount) ||
			(value.reviewView !== "overview" && value.reviewView !== "card") ||
			!Number.isInteger(value.cardIndex) ||
			typeof value.cardIndex !== "number" ||
			value.cardIndex < 0 ||
			typeof value.revealGeneratedAnswers !== "boolean"
		) {
			return null;
		}
		return value as PersistedReview;
	} catch {
		return null;
	}
}
