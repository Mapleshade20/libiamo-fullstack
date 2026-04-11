import { fail } from "@sveltejs/kit";
import { and, eq, or } from "drizzle-orm";
import { scheduleManualSchema } from "$lib/schemas";
import { db } from "$lib/server/db";
import { task, template } from "$lib/server/db/schema";
import { scheduleTaskManually, getMondayOfWeek, toDateString } from "$lib/server/tasks";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const dateFilter = event.url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
	const languageFilter = (event.url.searchParams.get("language") ?? "en") as "en" | "es" | "fr" | "ja";

	const [y, m, d] = dateFilter.split("-").map(Number);
	const filterDateObj = new Date(y, m - 1, d, 12, 0, 0);
	const mondayFilter = toDateString(getMondayOfWeek(filterDateObj));

	const scheduledTasks = await db
		.select({
			id: task.id,
			titleResolved: task.titleResolved,
			date: task.date,
			origin: task.origin,
			language: task.language,
			templateTitle: template.titleBase,
			templateType: template.type,
			templateDuration: template.duration,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(
			and(
				eq(task.language, languageFilter),
				// 核心修复：查找指定日的 日任务，或指定日所在周(周一)的 周任务
				or(
					and(eq(template.duration, "daily"), eq(task.date, dateFilter)),
					and(eq(template.duration, "weekly"), eq(task.date, mondayFilter))
				)
			)
		)
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
			await scheduleTaskManually(Number(result.data.templateId), result.data.date);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to schedule task";
			return fail(400, { message, values: raw });
		}

		return { success: true };
	},

	deleteTask: async (event) => {
		const formData = await event.request.formData();
		const taskId = Number(formData.get("taskId"));

		if (!taskId) {
			return fail(400, { message: "Invalid task ID" });
		}

		try {
			await db.delete(task).where(eq(task.id, taskId));
			return { success: true, deleted: true };
		} catch (err) {
			return fail(500, { message: "Failed to delete task" });
		}
	}
};