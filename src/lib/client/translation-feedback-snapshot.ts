import type { LocalCardState, SecondDraftLocalState } from "$lib/components/translate-evaluation/types";
import type { StudyQueueKind } from "$lib/review";

const SCHEMA_VERSION = 3;

export type TranslationTransferQueueItem = { noteId: number; exampleIndex: number; queueKind: StudyQueueKind };

export type TranslationTransferSnapshot = {
	initialized: boolean;
	queue: TranslationTransferQueueItem[];
};

export function advanceTranslationTransferQueue(
	queue: readonly TranslationTransferQueueItem[],
	outcome: "incorrect" | "pass",
	nextExampleIndex?: number,
): TranslationTransferQueueItem[] {
	const [active, ...remaining] = queue;
	if (!active) return [];
	if (outcome === "pass") return remaining;
	if (!Number.isInteger(nextExampleIndex) || Number(nextExampleIndex) < 0)
		throw new Error("A valid next example is required after an incorrect answer.");
	return [...remaining, { noteId: active.noteId, exampleIndex: Number(nextExampleIndex), queueKind: "learning" }];
}

export type TranslationFeedbackSnapshot = {
	schemaVersion: typeof SCHEMA_VERSION;
	attemptId: number;
	evaluatedAt: string;
	correctionStep: "overview" | "cards";
	currentCardIndex: number;
	cards: LocalCardState[];
	secondDraft: SecondDraftLocalState;
	transfer: TranslationTransferSnapshot;
};

export function translationFeedbackSnapshotKey(attemptId: number) {
	return `libiamo:translation-feedback:${attemptId}`;
}

function isCardState(value: unknown): value is LocalCardState {
	if (!value || typeof value !== "object") return false;
	const card = value as Partial<LocalCardState>;
	return (
		["initial", "first_reject", "second_reject", "accepted", "provider_error"].includes(card.phase ?? "") &&
		Number.isInteger(card.attemptCount) &&
		(card.attemptCount ?? -1) >= 0 &&
		(card.attemptCount ?? 3) <= 2 &&
		typeof card.input === "string" &&
		(card.feedback === null || typeof card.feedback === "string") &&
		(card.acceptedAnswer === null || typeof card.acceptedAnswer === "string") &&
		(card.acceptedDiff === null || Array.isArray(card.acceptedDiff))
	);
}

function isSecondDraftState(value: unknown): value is SecondDraftLocalState {
	if (!value || typeof value !== "object") return false;
	const state = value as Partial<SecondDraftLocalState>;
	return (
		Array.isArray(state.paragraphs) &&
		state.paragraphs.every((paragraph) => typeof paragraph === "string") &&
		Array.isArray(state.unresolvedOrdinals) &&
		state.unresolvedOrdinals.every((ordinal) => Number.isInteger(ordinal) && ordinal >= 0) &&
		typeof state.passed === "boolean" &&
		typeof state.skipped === "boolean" &&
		(state.providerError === null || typeof state.providerError === "string") &&
		(state.commentary === null || typeof state.commentary === "string")
	);
}

function isTransferState(value: unknown): value is TranslationTransferSnapshot {
	if (!value || typeof value !== "object") return false;
	const state = value as Partial<TranslationTransferSnapshot>;
	return (
		typeof state.initialized === "boolean" &&
		Array.isArray(state.queue) &&
		state.queue.every(
			(item) =>
				!!item &&
				typeof item === "object" &&
				Number.isInteger((item as { noteId?: unknown }).noteId) &&
				Number((item as { noteId: number }).noteId) > 0 &&
				Number.isInteger((item as { exampleIndex?: unknown }).exampleIndex) &&
				Number((item as { exampleIndex: number }).exampleIndex) >= 0 &&
				["new", "learning", "review"].includes(String((item as { queueKind?: unknown }).queueKind)),
		)
	);
}

export function parseTranslationFeedbackSnapshot(raw: string | null, expected: { attemptId: number; evaluatedAt: string; cardCount: number }) {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<TranslationFeedbackSnapshot>;
		if (
			value.schemaVersion !== SCHEMA_VERSION ||
			value.attemptId !== expected.attemptId ||
			value.evaluatedAt !== expected.evaluatedAt ||
			!Array.isArray(value.cards) ||
			value.cards.length !== expected.cardCount ||
			!value.cards.every(isCardState) ||
			!Number.isInteger(value.currentCardIndex) ||
			(value.currentCardIndex ?? -1) < 0 ||
			(value.currentCardIndex ?? 0) > Math.max(0, expected.cardCount - 1) ||
			(value.correctionStep !== "overview" && value.correctionStep !== "cards") ||
			!isSecondDraftState(value.secondDraft) ||
			!isTransferState(value.transfer)
		) {
			return null;
		}
		return value as TranslationFeedbackSnapshot;
	} catch {
		return null;
	}
}

export function saveTranslationFeedbackSnapshot(snapshot: TranslationFeedbackSnapshot) {
	if (typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.setItem(translationFeedbackSnapshotKey(snapshot.attemptId), JSON.stringify(snapshot));
	} catch {
		// Session storage can be unavailable in restricted browser contexts.
	}
}

export function clearTranslationFeedbackSnapshot(attemptId: number) {
	if (typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.removeItem(translationFeedbackSnapshotKey(attemptId));
	} catch {
		// Session storage can be unavailable in restricted browser contexts.
	}
}

export function emptyTranslationFeedbackSnapshot(input: {
	attemptId: number;
	evaluatedAt: string;
	cardCount: number;
	firstDraftParagraphs: string[];
}): TranslationFeedbackSnapshot {
	return {
		schemaVersion: SCHEMA_VERSION,
		attemptId: input.attemptId,
		evaluatedAt: input.evaluatedAt,
		correctionStep: "overview",
		currentCardIndex: 0,
		cards: Array.from({ length: input.cardCount }, () => ({
			phase: "initial",
			attemptCount: 0,
			input: "",
			feedback: null,
			acceptedAnswer: null,
			acceptedDiff: null,
		})),
		secondDraft: {
			paragraphs: [...input.firstDraftParagraphs],
			unresolvedOrdinals: [],
			passed: false,
			skipped: false,
			providerError: null,
			commentary: null,
		},
		transfer: { initialized: false, queue: [] },
	};
}
