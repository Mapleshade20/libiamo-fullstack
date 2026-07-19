/** Shared types for the translation evaluation learning flow. */

export type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "F";

export type RatingKey = "accuracy" | "naturalness" | "grammar" | "register" | "contextualFit" | "overall";

export type Ratings = Record<RatingKey, Grade>;

export type DiffPart =
	| { type: "unchanged"; text: string }
	| { type: "delete"; text: string }
	| { type: "add"; text: string }
	| { type: "replace"; from: string; to: string };

export type CardValidationWarning = "source_unmatched" | "answer_unmatched" | "reference_diff_invalid" | "duplicate";

export type CorrectionCardData = {
	ordinal: number;
	sourceText: string;
	/** Sentence-level span copied from first draft; used for overview highlight. */
	originalAnswer: string;
	initialHint: string;
	deeperHint: string;
	referenceAnswer: string;
	/** Fewer edits from originalAnswer that still read as correct and natural. */
	minimalAnswer: string;
	/** Pre-parsed ASTs for demo/runtime rendering. Raw XML lives on the server. */
	minimalDiff: DiffPart[];
	referenceDiff: DiffPart[];
	/** Native-language explanation of the learner issues and language points. */
	teachersNote: string;
	/** Server-derived warnings; empty when fully verified. */
	warnings: CardValidationWarning[];
};

export type EvaluationData = {
	overallCommentary: string;
	ratings: Ratings;
	cards: CorrectionCardData[];
	/** Full first-draft text for the overview left column (paragraphs joined). */
	firstDraft: string;
	/** Paragraphs of first draft (for second-draft init). */
	firstDraftParagraphs: string[];
	/** Prompt paragraphs in native language. */
	sourceParagraphs: string[];
};

export type CardPhase = "initial" | "first_reject" | "second_reject" | "accepted" | "provider_error";

export type LocalCardState = {
	phase: CardPhase;
	attemptCount: number;
	input: string;
	feedback: string | null;
	acceptedAnswer: string | null;
	acceptedDiff: DiffPart[] | null;
};

export type PracticeGenStatus = "idle" | "generating" | "failed" | "ready";

export type SecondDraftLocalState = {
	paragraphs: string[];
	unresolvedOrdinals: number[];
	passed: boolean;
	skipped: boolean;
	providerError: string | null;
	/** Learner-facing commentary from the second-draft verifier. */
	commentary: string | null;
};

export type TransferNoteFixture = {
	id: number;
	targetPattern: string;
	explanation: string;
	exercises: Array<{ front: string; back: string }>;
};

/** Demo / presentation phase keys used by the state switcher. */
export type DemoScene =
	| "evaluating"
	| "evaluating-failed"
	| "evaluated"
	| "evaluated-warning"
	| "no-cards"
	| "card-initial"
	| "card-first-reject"
	| "card-accept"
	| "card-second-reject"
	| "provider-error"
	| "second-draft-generating"
	| "second-draft-failed"
	| "second-draft-ready"
	| "second-draft-waiting"
	| "transfer"
	| "complete";

export type CubicBezier = readonly [number, number, number, number];

export type MotionTokens = {
	durationFast: number;
	duration: number;
	durationSlow: number;
	easeOut: CubicBezier;
	easeInOut: CubicBezier;
};

export const MOTION_TOKENS: MotionTokens = {
	durationFast: 0.22,
	duration: 0.45,
	durationSlow: 0.75,
	easeOut: [0.22, 1, 0.36, 1],
	easeInOut: [0.45, 0, 0.15, 1],
};

export const RATING_ORDER: RatingKey[] = ["accuracy", "naturalness", "grammar", "register", "contextualFit", "overall"];

export const RATING_I18N_KEYS: Record<RatingKey, string> = {
	accuracy: "eval.rating.accuracy",
	naturalness: "eval.rating.naturalness",
	grammar: "eval.rating.grammar",
	register: "eval.rating.register",
	contextualFit: "eval.rating.contextualFit",
	overall: "eval.rating.overall",
};
