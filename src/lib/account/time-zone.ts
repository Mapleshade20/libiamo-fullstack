import { sandboxed } from "#lib/components/tour/sandbox.svelte.ts";
import { clock } from "#lib/time/clock.svelte.ts";
import { refreshAll } from "$app/navigation";
import { keepTimeZone } from "./account.remote.ts";
import { account } from "./account.svelte.ts";

/*
 * The learner's time zone is the device's: the server counts their days, weeks and reviews in the zone it holds
 * (`user.time_zone`), and renders every date in it. When the page opens, or comes back into view, in another zone
 * (a trip, a second device), the server is told and the page asks again for everything, now in the new zone.
 */
const deviceZone = () => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
	} catch {
		return null;
	}
};

/** Follows the device's time zone while the page is open (the root layout); returns the stop. */
export function followTimeZone(): () => void {
	let asked = "";
	const check = () => {
		const tz = deviceZone();
		if (!account.signedIn || sandboxed() || !tz || tz === clock.timeZone || tz === asked) return;
		asked = tz;
		keepTimeZone(tz)
			// The page was made in another zone either way: everything is asked for again.
			.then(() => refreshAll())
			.catch((e) => {
				asked = "";
				console.error("the time zone was not kept", e);
			});
	};
	check();
	const visible = () => {
		if (document.visibilityState === "visible") check();
	};
	document.addEventListener("visibilitychange", visible);
	return () => document.removeEventListener("visibilitychange", visible);
}
