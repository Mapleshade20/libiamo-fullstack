import { resolveLearnerDocumentLanguage } from "$lib/document-language";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ cookies, locals }) => ({
	displayClock: { now: Date.now(), timeZone: getBrowserTimezone(cookies) },
	learnerDocumentLanguage: resolveLearnerDocumentLanguage(locals.user?.activeLanguage),
	...(locals.user ? { viewer: { name: locals.user.name } } : {}),
});
