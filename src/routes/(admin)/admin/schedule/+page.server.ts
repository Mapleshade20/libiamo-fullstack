import { fail } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { LanguageCode } from "$lib/constants";
import { scheduleManualSchema } from "$lib/schemas";
import { db } from "$lib/server/db";
import { task, template } from "$lib/server/db/schema";
import { scheduleTaskManually } from "$lib/server/tasks";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const dateFilter = event.url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
	const languageFilter = (event.url.searchParams.get("language") ?? "en") as LanguageCode;

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
		.where(and(eq(task.date, dateFilter), eq(task.language, languageFilter)))
		.orderBy(task.id);

	const activeTemplates = await db
		.select({ id: template.id, titleBase: template.titleBase, language: template.language })
		.from(template)
		.where(eq(template.isActive, true))
		.orderBy(template.id);

	return {
		scheduledTasks,
		activeTemplates,
		filters: { date: dateFilter, language: languageFilter },
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
			return fail(400, { errors: result.error.flatten().fieldErrors, values: raw });
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
