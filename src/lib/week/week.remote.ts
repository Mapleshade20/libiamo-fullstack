import { z } from "zod";
import { LEARNABLE } from "#lib/constants.ts";
import { db } from "#lib/server/db/index.ts";
import { learner } from "#lib/server/guard.ts";
import { credit, historyOf, reviewsDone, weekOf } from "#lib/server/week/days.ts";
import { command, query } from "$app/server";
import type { HistoryWeek, WeekView } from "./types.ts";

/* The learner's week: this week's glasses, the weeks behind it (the profile), and a visit that finds nothing to review. */

export const week = query(async (): Promise<WeekView> => weekOf(learner()));

export const history = query(z.number().int().min(1).max(104), async (weeks): Promise<HistoryWeek[]> => historyOf(learner(), weeks));

/** A visit found nothing left to review in the language they work in (and something in the notebook to review): the
    reviews are as done as they can be today. */
export const lookAtReviews = command(z.enum(LEARNABLE), async (language) => {
	const u = learner();
	if (!(await reviewsDone(db, u.id, language))) return;
	if (await credit(db, u, "reviewed", language)) await week().refresh();
});
