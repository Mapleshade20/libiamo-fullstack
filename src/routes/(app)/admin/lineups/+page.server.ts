import { fail } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isLanguageCode, type LanguageCode, type LineupKind } from "$lib/constants";
import { lineupEntrySchema } from "$lib/schemas";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { task } from "$lib/server/db/schema";
import { addTaskToLineup, findLineup, LineupError, listLineupTasks } from "$lib/server/lineups";
import { dayjs, getCurrentWeekString, getMondayFromWeekString, toDateString } from "$lib/server/scheduling/dates";
import type { Actions, PageServerLoad } from "./$types";

const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

/** A lineup's `starts_on`: the date itself for daily lineups, the week's Monday for weekly ones. */
function lineupStart(kind: LineupKind, rawDate: string) {
	return kind === "weekly" ? toDateString(getMondayFromWeekString(rawDate)) : rawDate;
}

function requestedDate(kind: LineupKind, raw: string | null) {
	if (kind === "weekly") return raw && ISO_WEEK.test(raw) ? raw : getCurrentWeekString();
	return raw && dayjs(raw, "YYYY-MM-DD", true).isValid() ? raw : toDateString(new Date());
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);

	const kind: LineupKind = event.url.searchParams.get("kind") === "weekly" ? "weekly" : "daily";
	const rawDate = requestedDate(kind, event.url.searchParams.get("date"));
	const languageParam = event.url.searchParams.get("language");
	const language: LanguageCode = isLanguageCode(languageParam) ? languageParam : "en";
	const startsOn = lineupStart(kind, rawDate);

	const found = await findLineup(language, kind, startsOn);
	const entries = found ? await listLineupTasks(found.id) : [];
	const present = new Set(entries.map((entry) => entry.id));
	const candidates = await db
		.select({ id: task.id, title: task.title })
		.from(task)
		.where(and(eq(task.language, language), eq(task.isActive, true), eq(task.interactionType, "chat")))
		.orderBy(task.id);

	return {
		entries,
		candidates: candidates.filter((candidate) => !present.has(candidate.id)),
		filters: { kind, rawDate, startsOn, language },
	};
};

export const actions: Actions = {
	add: async (event) => {
		requireAdmin(event);

		const formData = await event.request.formData();
		const raw = {
			taskId: formData.get("taskId")?.toString() ?? "",
			kind: formData.get("kind")?.toString() ?? "",
			date: formData.get("date")?.toString() ?? "",
		};
		const result = lineupEntrySchema.safeParse(raw);
		if (!result.success) return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });

		try {
			await addTaskToLineup({ taskId: result.data.taskId, kind: result.data.kind, startsOn: lineupStart(result.data.kind, result.data.date) });
		} catch (cause) {
			if (cause instanceof LineupError) return fail(400, { message: cause.message, values: raw });
			throw cause;
		}
		return { success: true };
	},
};
