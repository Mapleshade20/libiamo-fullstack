<script lang="ts">
import { app } from "#lib/account/app.svelte.ts";
import { onboarding } from "#lib/account/onboarding.svelte.ts";
import { dev } from "$app/env";
import { page } from "$app/state";
import { hasContent } from "./content";
import { director } from "./director.svelte";
import { CHAPTERS } from "./script";
import TourLayer from "./TourLayer.svelte";
import type { Tape } from "./tape";

/*
 * Starts the tour when it is asked for (the welcome's last step, the developer settings, or ?tour in dev: ?tour=record
 * records a new tape, ?at=<n> starts at a chapter), with the tape for the learner's languages. A language the tour
 * has no content for yet is shown on the English one.
 */
const TAPES = import.meta.glob<Tape>("./tapes/*.json", { import: "default" });
let starting = false;
// ?tour starts it once: leaving it must not start it again while the address still says so.
let fromUrl = false;
$effect(() => {
	const asked = dev ? page.url.searchParams.get("tour") : null;
	if (!asked) fromUrl = false;
	if (starting || director.on || !(onboarding.tour || (asked && !fromUrl))) return;
	if (asked) fromUrl = true;
	if (page.url.pathname !== "/") return;
	starting = true;
	onboarding.tour = false;
	// The tour runs on content for the language being learned and a tape for the tutor's language; without them, in
	// English and with an English-speaking tutor, so what it says, the session and the tutor's notes agree.
	const was = { active: app.prefs.active, feedback: app.prefs.feedback };
	if (!hasContent(was.active)) app.prefs.active = "en";
	let load = TAPES[`./tapes/${app.prefs.active}-${app.tutor}.json`];
	if (!load) {
		app.prefs.feedback = "target";
		load = TAPES[`./tapes/${app.prefs.active}-${app.prefs.active}.json`] ?? TAPES["./tapes/en-en.json"];
	}
	director.onEnd = () => {
		app.prefs.active = was.active;
		app.prefs.feedback = was.feedback;
	};
	(load ? load() : Promise.resolve([] as Tape)).then((tape) => {
		director.start(CHAPTERS, tape, { record: dev && asked === "record", at: Number(page.url.searchParams.get("at") ?? 0) });
		starting = false;
	});
});
</script>

{#if director.on}
	<TourLayer />
{/if}
