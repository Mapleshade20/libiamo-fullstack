import { me } from "#lib/account/account.remote.ts";
import { pageSetup } from "#lib/server/account/page.ts";
import { picturesOf } from "#lib/server/backdrop/today.ts";
import { dictsFor } from "#lib/server/i18n.ts";
import { shelves } from "#lib/writing/writing.remote.ts";
import { ORIGIN } from "$app/env/private";

/* Who is signed in, their pieces, and the strings the page speaks, once per page load (lib/account/account.svelte.ts,
   lib/writing/writing.svelte.ts keep them up to date after). */
export async function load(event) {
	const setup = pageSetup(event);
	// Who they are and their shelf at once (the shelf only once they are set up).
	const [who, shelf] = await Promise.all([me(), event.locals.user?.onboardedAt ? shelves() : {}]);
	const p = who?.prefs;
	const tutor = p ? (p.feedback === "native" ? p.native : p.active) : setup.firstLang;
	const now = Date.now();
	const timeZone = event.locals.user?.timeZone ?? "UTC";
	return {
		me: who,
		shelves: shelf,
		firstLang: setup.firstLang,
		folded: setup.folded,
		/** The public origin, for the addresses in the page's head (lib/seo.ts). */
		origin: new URL(ORIGIN).origin,
		/** The time the page was made and the learner's time zone, so dates read the same on the server and in the browser. */
		clock: { now, timeZone },
		/** The day's print and painting behind the home page and the scene card (the learner picks which in settings). */
		pictures: who?.onboarded ? picturesOf(now, timeZone) : null,
		// The signed-out pages and the welcome speak the first language; the app, the one worked in and the tutor's.
		dicts: who?.onboarded ? dictsFor(setup.lang, tutor) : dictsFor(setup.firstLang),
	};
}
