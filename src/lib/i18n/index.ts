import type { LanguageCode } from "$lib/constants";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";

const translations: Record<LanguageCode, Record<string, string>> = { en, es, fr, ja };

export function t(lang: LanguageCode, key: string): string {
	return translations[lang]?.[key] ?? translations.en[key] ?? key;
}
