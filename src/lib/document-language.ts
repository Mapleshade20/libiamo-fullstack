import { getHtmlLanguageTag, isLanguageCode } from "$lib/constants";

export function resolveLearnerDocumentLanguage(activeLanguage: unknown): string {
	return isLanguageCode(activeLanguage) ? getHtmlLanguageTag(activeLanguage) : "en";
}

export function resolvePageDocumentLanguage({
	routeId,
	isErrorPage,
	learnerDocumentLanguage,
}: {
	routeId: string | null;
	isErrorPage: boolean;
	learnerDocumentLanguage: string;
}): string {
	if (isErrorPage || routeId === null || routeId === "/welcome" || routeId.startsWith("/welcome/")) return "en";
	return learnerDocumentLanguage;
}
