import { resolveLearnerDocumentLanguage } from "$lib/app/document-language";
import { getBrowserTimezone } from "$lib/time/browser-timezone";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ cookies, locals }) => ({
	displayClock: { now: Date.now(), timeZone: getBrowserTimezone(cookies) },
	learnerDocumentLanguage: resolveLearnerDocumentLanguage(locals.user?.activeLanguage),
	...(locals.user ? { viewer: { name: locals.user.name } } : {}),
});
