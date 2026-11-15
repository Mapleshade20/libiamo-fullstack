import { z } from "zod";
import { SUGGESTION_PLACES } from "#lib/constants.ts";
import { learner } from "#lib/server/guard.ts";
import { suggest as file, suggestionsOf } from "#lib/server/scenario/suggestions.ts";
import { command, query } from "$app/server";

/* The learner's suggested situations: what they sent and what became of each. */
export const mySuggestions = query(async () => suggestionsOf(learner().id));

export const suggest = command(
	z.object({
		place: z.enum(SUGGESTION_PLACES),
		language: z.string().max(10),
		situation: z.string().trim().min(1).max(60_000),
		purpose: z.string().trim().min(1).max(160),
		mine: z.string().trim().max(20_000).optional(),
	}),
	async (input) => {
		const u = learner();
		const ok = await file(u.id, input);
		if (ok) await mySuggestions().refresh();
		return { ok };
	},
);
