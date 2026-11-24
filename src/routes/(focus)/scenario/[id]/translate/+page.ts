import { app } from "#lib/account/app.svelte.ts";
import { opening } from "#lib/client/refresh.ts";
import { scenarioLang } from "#lib/scenario/href.ts";
import { sheet } from "#lib/scenario/scenario.remote.ts";

export const load = opening(({ params, url }) => [sheet({ id: params.id, lang: scenarioLang(url, app.lang) })], { fresh: true });
