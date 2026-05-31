export const UI_VARIANTS = ["reddit", "apple_mail", "discord", "imessage", "ao3", "translator"] as const;
export type UiVariant = (typeof UI_VARIANTS)[number];

export const PRACTICE_UI_TEXT_MAX_LENGTH = 10000;
export const MAIL_TEXT_MAX_LENGTH = 50000;
export const AUTH_EMAIL_MAX_LENGTH = 254;
export const AUTH_PASSWORD_MAX_LENGTH = 1024;
export const AUTH_TOKEN_MAX_LENGTH = 2048;
export const USER_NAME_MAX_LENGTH = 100;
export const USER_TEXT_MAX_LENGTH = 10000;
export const USER_LONG_TEXT_MAX_LENGTH = 50000;
export const USER_KEYWORDS_MAX_LENGTH = 10000;
export const BYOK_API_KEY_MAX_LENGTH = 2048;
export const BYOK_MODEL_MAX_LENGTH = 512;
export const BYOK_BASE_URL_MAX_LENGTH = 2048;
export const CLIENT_MESSAGE_ID_MAX_LENGTH = 256;

export const UI_VARIANT_LABELS: Record<UiVariant, string> = {
	reddit: "Reddit",
	apple_mail: "Apple Mail",
	discord: "Discord",
	imessage: "iMessage",
	ao3: "AO3",
	translator: "Translator",
};

export const LANGUAGE_CODES = ["en", "es", "fr", "ja"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
	en: "English",
	es: "Español",
	fr: "Français",
	ja: "日本語",
};

export const NATIVE_LANGUAGE_CODES = [
	"zh",
	"en",
	"hi",
	"es",
	"fr",
	"ar",
	"bn",
	"pt",
	"ru",
	"ur",
	"id",
	"de",
	"ja",
	"pa",
	"mr",
	"te",
	"tr",
	"ko",
	"vi",
	"ta",
	"it",
	"gu",
	"fa",
	"pl",
	"uk",
	"ml",
	"kn",
	"or",
	"my",
	"th",
] as const;
export type NativeLanguageCode = (typeof NATIVE_LANGUAGE_CODES)[number];

export function getNativeLanguageOptions(locale = "en"): { value: NativeLanguageCode; label: string }[] {
	let displayNames: Intl.DisplayNames | undefined;
	try {
		displayNames = new Intl.DisplayNames([locale], { type: "language" });
	} catch {
		displayNames = undefined;
	}

	return NATIVE_LANGUAGE_CODES.map((code) => ({
		value: code,
		label: displayNames?.of(code) ?? code.toUpperCase(),
	}));
}

export const LANGUAGE_ENGLISH_NAMES: Record<LanguageCode, string> = {
	en: "English",
	es: "Spanish",
	fr: "French",
	ja: "Japanese",
};

export function getLanguageEnglishName(code: string): string {
	return LANGUAGE_CODES.includes(code as LanguageCode) ? LANGUAGE_ENGLISH_NAMES[code as LanguageCode] : code;
}

export const INTERACTION_TYPES = ["chat", "slow", "translate"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
	chat: "Chat",
	slow: "Slow Reply",
	translate: "Translate",
};

export const CADENCES = ["weekly", "daily", "none"] as const;
export type Cadence = (typeof CADENCES)[number];

// ── Review Cards ──────────────────────────────────────────────────────
export const CARD_TYPES = ["vocabulary", "expression", "grammar", "correction"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const CARD_TYPE_LABELS: Record<CardType, string> = {
	vocabulary: "Vocabulary",
	expression: "Expression",
	grammar: "Grammar",
	correction: "Correction",
};
