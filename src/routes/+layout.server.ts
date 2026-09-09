import { getBrowserTimezone } from "$lib/server/browser-timezone";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ cookies }) => ({
	displayClock: { now: Date.now(), timeZone: getBrowserTimezone(cookies) },
});
