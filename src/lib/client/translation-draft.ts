import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";

export type TranslationDraftAnswer = {
	paragraphIndex: number;
	translation: string;
	candidateIndex: number;
};

const TRANSLATION_DRAFT_VERSION = 1;

export function translationDraftStorageKey(attemptId: number) {
	return `translation-draft:${attemptId}`;
}

export function serializeTranslationDraft(answers: TranslationDraftAnswer[]) {
	return JSON.stringify({ version: TRANSLATION_DRAFT_VERSION, answers });
}

export function parseTranslationDraft(raw: string | null, fallback: TranslationDraftAnswer[], candidateCounts: number[]): TranslationDraftAnswer[] {
	if (!raw) return fallback;
	try {
		const stored = JSON.parse(raw) as { version?: unknown; answers?: unknown };
		if (stored.version !== TRANSLATION_DRAFT_VERSION || !Array.isArray(stored.answers) || stored.answers.length !== fallback.length) return fallback;
		const parsed = stored.answers.map((value, index) => {
			if (!value || typeof value !== "object") return null;
			const answer = value as Record<string, unknown>;
			if (
				answer.paragraphIndex !== index ||
				typeof answer.translation !== "string" ||
				answer.translation.length > PRACTICE_UI_TEXT_MAX_LENGTH ||
				!Number.isInteger(answer.candidateIndex) ||
				Number(answer.candidateIndex) < 0 ||
				Number(answer.candidateIndex) >= (candidateCounts[index] ?? 0)
			) {
				return null;
			}
			return {
				paragraphIndex: index,
				translation: answer.translation,
				candidateIndex: Number(answer.candidateIndex),
			};
		});
		return parsed.every((answer): answer is TranslationDraftAnswer => answer !== null) ? parsed : fallback;
	} catch {
		return fallback;
	}
}
