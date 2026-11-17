import { z } from "zod";
import { learner } from "#lib/server/guard.ts";
import { libraryOf, scenarioViewOf, shelfScenariosOf } from "#lib/server/scenario/scenarios.ts";
import { saveSheet, sheetOf } from "#lib/server/translation/sheet.ts";
import { shelves } from "#lib/writing/writing.remote.ts";
import { command, query } from "$app/server";

/* Scenarios as the pages read them, in the language the page speaks (the argument, so a switch needs no refresh). */
const lang = z.string().max(10);

export const library = query(lang, async (language) => libraryOf(learner(), language, language));
export const shelfScenarios = query(lang, async (language) => shelfScenariosOf(learner(), language));
export const scenarioView = query(z.object({ id: z.string().max(60), lang }), async ({ id, lang }) => scenarioViewOf(learner(), id, lang));

/** The translation sheet: the scenario with its source (and the text of a piece taken up again: lib/client/drafts.ts
    keeps what is typed). */
export const sheet = query(z.object({ id: z.string().max(60), lang }), async ({ id, lang }) => sheetOf(learner(), id, lang));

/**
 * The sheet sent in ("done"): its piece, created with the translation, the source it was made against and the plan typed
 * on the scenario's page. Until then the draft is only on the learner's device.
 */
export const sendSheet = command(
	z.object({
		id: z.string().max(60),
		lang,
		text: z.string().trim().min(1).max(60_000),
		plan: z.string().max(4000).default(""),
		sourceId: z.uuid(),
		generation: z.uuid(),
	}),
	async ({ id, lang, text, plan, sourceId, generation }) => {
		const saved = await saveSheet(learner(), { scenarioId: id, language: lang, text, plan, sourceId, generation });
		if (saved?.created) await Promise.all([shelves().refresh(), scenarioView({ id, lang }).refresh()]);
		return { pieceId: saved?.id ?? null };
	},
);
