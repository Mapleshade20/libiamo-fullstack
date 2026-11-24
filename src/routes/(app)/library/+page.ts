import { app } from "#lib/account/app.svelte.ts";
import { opening } from "#lib/client/refresh.ts";
import { hasScenarios } from "#lib/constants.ts";
import { library } from "#lib/scenario/scenario.remote.ts";

export const load = opening(() => [hasScenarios(app.lang) ? library(app.lang) : null]);
