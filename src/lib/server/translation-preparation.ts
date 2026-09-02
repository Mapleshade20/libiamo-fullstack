import { NATIVE_LANGUAGE_CODES } from "$lib/constants";
import type { LanguageCode } from "$lib/i18n";
import { findTranslationAttempt, getTranslationTemplate } from "$lib/server/translation-workflow";

export type TranslationPreparationBlockedReason = "missing-native-language" | "same-language" | null;

export interface TranslationPreparationData {
	template: NonNullable<Awaited<ReturnType<typeof getTranslationTemplate>>>;
	blockedReason: TranslationPreparationBlockedReason;
	attempt: { id: number; workflowPhase: string } | null;
}

interface TranslationPreparationInput {
	userId: string;
	templateId: number;
	activeLanguage: LanguageCode;
	nativeLanguage: string | null | undefined;
}

function validPromptLanguage(value: unknown): value is string {
	return typeof value === "string" && NATIVE_LANGUAGE_CODES.includes(value as (typeof NATIVE_LANGUAGE_CODES)[number]);
}

export async function getTranslationPreparationData({
	userId,
	templateId,
	activeLanguage,
	nativeLanguage,
}: TranslationPreparationInput): Promise<TranslationPreparationData | null> {
	const template = await getTranslationTemplate(templateId, activeLanguage);
	if (!template) return null;

	let blockedReason: TranslationPreparationBlockedReason = null;
	if (!validPromptLanguage(nativeLanguage)) blockedReason = "missing-native-language";
	else if (nativeLanguage === template.language) blockedReason = "same-language";

	const attempt =
		blockedReason || !nativeLanguage
			? null
			: await findTranslationAttempt({
					userId,
					templateId,
					promptLanguage: nativeLanguage,
				});

	return {
		template,
		blockedReason,
		attempt: attempt ? { id: attempt.id, workflowPhase: attempt.workflowPhase } : null,
	};
}
