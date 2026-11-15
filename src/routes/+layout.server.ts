import { me } from "#lib/account/account.remote.ts";
import { pageSetup } from "#lib/server/account/page.ts";
import { dictsFor } from "#lib/server/i18n.ts";
import { pieces } from "#lib/writing/writing.remote.ts";

/* Who is signed in, their pieces, and the strings the page speaks, once per page load (lib/account/account.svelte.ts,
   lib/writing/writing.svelte.ts keep them up to date after). */
export async function load(event) {
	const setup = pageSetup(event);
	const who = await me();
	const p = who?.prefs;
	const tutor = p ? (p.feedback === "native" ? p.native : p.active) : setup.firstLang;
	return {
		me: who,
		pieces: who?.onboarded ? await pieces() : [],
		firstLang: setup.firstLang,
		folded: setup.folded,
		/** The time the page was made and the learner's time zone, so dates read the same on the server and in the browser. */
		clock: { now: Date.now(), timeZone: event.locals.user?.timeZone ?? "UTC" },
		// The signed-out pages and the welcome speak the first language; the app, the one worked in and the tutor's.
		dicts: who?.onboarded ? dictsFor(setup.lang, tutor) : dictsFor(setup.firstLang),
	};
}
