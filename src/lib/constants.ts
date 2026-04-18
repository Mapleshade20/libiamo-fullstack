export const UI_VARIANTS = ["reddit", "apple_mail", "discord", "imessage", "ao3", "translator"] as const;
export type UiVariant = (typeof UI_VARIANTS)[number];

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

export const INTERACTION_TYPES = ["chat", "oneshot", "slow", "translate"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
	chat: "Chat",
	oneshot: "One-shot",
	slow: "Slow Reply",
	translate: "Translate",
};

export const CADENCES = ["weekly", "daily"] as const;
export type Cadence = (typeof CADENCES)[number];
