import { resolveLearnerDocumentLanguage } from "$lib/app/document-language";
import { siteOrigin } from "$lib/server/app/site-origin";
import { getBrowserTimezone } from "$lib/time/browser-timezone";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ cookies, locals, url, untrack }) => ({
	siteOrigin: untrack(() => siteOrigin(url)),
	displayClock: { now: Date.now(), timeZone: getBrowserTimezone(cookies) },
	learnerDocumentLanguage: resolveLearnerDocumentLanguage(locals.user?.activeLanguage),
	...(locals.user ? { viewer: { name: locals.user.name } } : {}),
});
