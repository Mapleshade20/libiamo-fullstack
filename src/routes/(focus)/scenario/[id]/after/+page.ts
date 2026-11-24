import { app } from "#lib/account/app.svelte.ts";
import { opening } from "#lib/client/refresh.ts";
import { afterPlace } from "#lib/exchange/exchange.remote.ts";
import { scenarioLang } from "#lib/scenario/href.ts";

export const load = opening(({ params, url }) => [afterPlace({ scenarioId: params.id, lang: scenarioLang(url, app.lang) })], { fresh: true });
