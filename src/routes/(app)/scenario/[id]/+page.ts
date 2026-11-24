import { app } from "#lib/account/app.svelte.ts";
import { opening } from "#lib/client/refresh.ts";
import { glanceNow } from "#lib/notebook/notebook.svelte.ts";
import { scenarioView } from "#lib/scenario/scenario.remote.ts";

export const load = opening(({ params }) => [scenarioView({ id: params.id, lang: app.lang }), glanceNow()]);
