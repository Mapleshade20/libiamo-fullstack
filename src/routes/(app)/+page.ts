import { announcements } from "#lib/account/announcements.remote.ts";
import { app } from "#lib/account/app.svelte.ts";
import { opening } from "#lib/client/refresh.ts";
import { hasScenarios } from "#lib/constants.ts";
import { dueNow } from "#lib/notebook/notebook.svelte.ts";
import { shelfScenarios } from "#lib/scenario/scenario.remote.ts";

export const load = opening(() => [announcements(), hasScenarios(app.lang) ? shelfScenarios(app.lang) : null, dueNow()]);
