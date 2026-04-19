import { fail } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { LanguageCode } from "$lib/constants";
import { scheduleManualSchema } from "$lib/schemas";
import { db } from "$lib/server/db";
import { task, template } from "$lib/server/db/schema";
import { getMondayFromWeekString, scheduleTaskManually, toDateString } from "$lib/server/tasks";
import type { Actions, PageServerLoad } from "./$types";

// Helper: Safely generate the current ISO week string using UTC-based ISO week arithmetic
function getCurrentWeekString(): string {
	const now = new Date();
	const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
	// Move to the Thursday in the current ISO week so the ISO year is correct.
	date.setUTCDate(date.getUTCDate() + 4 - isoDay);
	const isoYear = date.getUTCFullYear();
	const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
	const firstThursdayIsoDay = firstThursday.getUTCDay() === 0 ? 7 : firstThursday.getUTCDay();
	firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstThursdayIsoDay);
	const weekNumber = 1 + Math.floor((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
	return `${isoYear}-W${weekNumber.toString().padStart(2, "0")}`;
}

export const load: PageServerLoad = async (event) => {
	// 1. Establish global mode (defaults to daily)
	const rawMode = event.url.searchParams.get("mode") ?? "daily";
	const mode: "daily" | "weekly" = rawMode === "weekly" ? "weekly" : "daily";
	// 2. Safely resolve the raw date parameter, with fallbacks to avoid empty string errors
	let rawDateParam = event.url.searchParams.get("date") ?? toDateString(new Date()).slice(0, 10);
	const isValidFormat = rawDateParam && (/^\d{4}-\d{2}-\d{2}$/.test(rawDateParam) || /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(rawDateParam));

	if (!isValidFormat) {
		rawDateParam = mode === "weekly" ? getCurrentWeekString() : new Date().toISOString().slice(0, 10);
	}

	const languageFilter = (event.url.searchParams.get("language") ?? "en") as LanguageCode;

	// 3. Resolve the actual DB filter date (convert week string to Monday's date)
	let dateFilter = rawDateParam;
	if (mode === "weekly" && rawDateParam.includes("-W")) {
		const monday = getMondayFromWeekString(rawDateParam);
		dateFilter = toDateString(monday);
	} else if (mode === "weekly" && !rawDateParam.includes("-W")) {
		// Recovery: Switched to weekly but URL held a daily date
		rawDateParam = getCurrentWeekString();
		const monday = getMondayFromWeekString(rawDateParam);
		dateFilter = toDateString(monday);
	} else if (mode === "daily" && rawDateParam.includes("-W")) {
		// Recovery: Switched to daily but URL held a weekly date
		rawDateParam = new Date().toISOString().slice(0, 10);
		dateFilter = rawDateParam;
	}

	// 4. Query scheduled tasks strictly scoped by the current mode
	const scheduledTasks = await db
		.select({
			id: task.id,
			title: task.title,
			date: task.date,
			origin: task.origin,
			language: task.language,
			templateTitle: template.titleBase,
			templateInteractionType: template.interactionType,
			templateCadence: template.cadence,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(
			and(
				eq(task.date, dateFilter),
				eq(task.language, languageFilter),
				eq(template.cadence, mode), // Scope query to daily or weekly tasks only
			),
		)
		.orderBy(task.id);

	// 5. Query active templates strictly scoped by the current mode
	const activeTemplates = await db
		.select({ id: template.id, titleBase: template.titleBase, language: template.language })
		.from(template)
		.where(and(eq(template.isActive, true), eq(template.cadence, mode))) // Filter templates by mode
		.orderBy(template.id);

	return {
		scheduledTasks,
		activeTemplates,
		filters: {
			mode,
			date: dateFilter, // Resolved YYYY-MM-DD
			rawDate: rawDateParam, // The input string (YYYY-MM-DD or YYYY-Www)
			language: languageFilter,
		},
	};
};

export const actions: Actions = {
	schedule: async (event) => {
		const formData = await event.request.formData();
		const raw = {
			templateId: formData.get("templateId")?.toString() ?? "",
			date: formData.get("date")?.toString() ?? "",
		};

		const result = scheduleManualSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		try {
			await scheduleTaskManually(result.data.templateId, result.data.date);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to schedule task";
			return fail(400, { message, values: raw });
		}

		return { success: true };
	},
};
