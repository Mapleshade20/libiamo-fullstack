export const TRANSLATION_GRADES = ["A", "B", "C", "F"] as const;
export type TranslationGrade = (typeof TRANSLATION_GRADES)[number];

export const TRANSLATION_RATING_KEYS = ["accuracy", "naturalness", "grammar", "overall"] as const;
export type TranslationRatingKey = (typeof TRANSLATION_RATING_KEYS)[number];
export type TranslationRatings = Record<TranslationRatingKey, TranslationGrade>;

export type TranslationDiffPart =
	| { type: "unchanged"; text: string }
	| { type: "delete"; text: string }
	| { type: "add"; text: string }
	| { type: "replace"; from: string; to: string };

export type TranslationCardWarning = "source_unmatched" | "answer_unmatched" | "duplicate" | "minimal_diff_invalid" | "reference_marked_invalid";
