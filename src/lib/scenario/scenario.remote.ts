import { z } from "zod";
import { learner } from "#lib/server/guard.ts";
import { libraryOf, scenarioViewOf, shelfScenariosOf } from "#lib/server/scenario/scenarios.ts";
import { query } from "$app/server";

/* Scenarios as the pages read them, in the language the page speaks (the argument, so a switch needs no refresh). */
const lang = z.string().max(10);

export const library = query(lang, async (language) => libraryOf(learner(), language, language));
export const shelfScenarios = query(lang, async (language) => shelfScenariosOf(learner(), language));
export const scenarioView = query(z.object({ id: z.string().max(60), lang }), async ({ id, lang }) => scenarioViewOf(learner(), id, lang));
