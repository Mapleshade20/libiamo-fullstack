import { getBrowserTimezone } from "$lib/server/browser-timezone";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ cookies, locals }) => ({
	displayClock: { now: Date.now(), timeZone: getBrowserTimezone(cookies) },
	...(locals.user ? { viewer: { name: locals.user.name } } : {}),
});
