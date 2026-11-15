import { z } from "zod";
import { learner } from "#lib/server/guard.ts";
import { planOf, savePlan } from "#lib/server/scenario/plans.ts";
import { libraryOf, scenarioViewOf, shelfScenariosOf } from "#lib/server/scenario/scenarios.ts";
import { saveSheet, sheetOf } from "#lib/server/translation/sheet.ts";
import { pieces } from "#lib/writing/writing.remote.ts";
import { command, query } from "$app/server";

/* Scenarios as the pages read them, in the language the page speaks (the argument, so a switch needs no refresh). */
const lang = z.string().max(10);

export const library = query(lang, async (language) => libraryOf(learner(), language, language));
export const shelfScenarios = query(lang, async (language) => shelfScenariosOf(learner(), language));
export const scenarioView = query(z.object({ id: z.string().max(60), lang }), async ({ id, lang }) => scenarioViewOf(learner(), id, lang));

/** The translation sheet: the scenario with its source, and the learner's draft so far. */
export const sheet = query(z.object({ id: z.string().max(60), lang }), async ({ id, lang }) => sheetOf(learner(), id, lang));

/** Keeps the sheet's draft as the learner types (the piece is created with the first words). */
export const saveDraft = command(
	z.object({ id: z.string().max(60), lang, text: z.string().max(60_000), sourceId: z.uuid(), generation: z.uuid() }),
	async ({ id, lang, text, sourceId, generation }) => {
		const saved = await saveSheet(learner(), { scenarioId: id, language: lang, text, sourceId, generation });
		// A new piece is one of theirs now: the shelf and the scenario page show it.
		if (saved?.created) await Promise.all([pieces().refresh(), scenarioView({ id, lang }).refresh()]);
		return { pieceId: saved?.id ?? null };
	},
);

/** The plan typed on a scenario's page before going in (the piece takes it when it is created). */
export const plan = query(z.object({ id: z.string().max(60), lang }), async ({ id, lang }) => planOf(learner().id, id, lang));
export const keepPlan = command(z.object({ id: z.string().max(60), lang, text: z.string().max(4000) }), async ({ id, lang, text }) =>
	savePlan(learner().id, id, lang, text),
);
