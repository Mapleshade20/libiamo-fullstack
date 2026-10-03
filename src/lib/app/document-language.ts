import { getHtmlLanguageTag, isLanguageCode } from "$lib/constants";

const ENGLISH_DOCUMENT_LANGUAGE_MARKER = 'name="libiamo-document-language" content="en"';

export function resolveLearnerDocumentLanguage(activeLanguage: unknown): string {
	return isLanguageCode(activeLanguage) ? getHtmlLanguageTag(activeLanguage) : "en";
}

export function resolvePageDocumentLanguage({
	routeId,
	learnerDocumentLanguage,
}: {
	routeId: string | null;
	learnerDocumentLanguage: string;
}): string {
	if (routeId === null || routeId === "/welcome" || routeId.startsWith("/welcome/")) return "en";
	return learnerDocumentLanguage;
}

export function applyDocumentLanguageToHtml(html: string, documentLanguage: string): string {
	const renderedLanguage = html.includes(ENGLISH_DOCUMENT_LANGUAGE_MARKER) ? "en" : documentLanguage;
	return html.replace('<html lang="en">', `<html lang="${renderedLanguage}">`);
}
