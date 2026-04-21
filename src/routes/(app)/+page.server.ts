import { fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { LanguageCode } from "$lib/i18n";
import { switchLanguageSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth";
import { getLocalDateString, getMondayOfWeekForDate } from "$lib/server/dates";
import { db } from "$lib/server/db";
import { task, template, userLearningProfile } from "$lib/server/db/schema";
import { ensureTasksForDate } from "$lib/server/tasks";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) return redirect(302, "/sign-in");
	const language = user.activeLanguage as LanguageCode;

	const userTz = user.timezone || "UTC";
	const userLocalDateStr = getLocalDateString(userTz);

	// Generate tasks if they don't exist yet, using the user's local date string
	await ensureTasksForDate(language, userLocalDateStr);

	const mondayStr = getMondayOfWeekForDate(userLocalDateStr);
	const weeklyTasks = await db
		.select({
			id: task.id,
			title: task.title,
			shortObjective: task.shortObjective,
			description: task.description,
			objectives: task.objectives,
			date: task.date,
			templateInteractionType: template.interactionType,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			templateCadence: template.cadence,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, mondayStr), eq(template.cadence, "weekly")));

	const dailyTasks = await db
		.select({
			id: task.id,
			title: task.title,
			shortObjective: task.shortObjective,
			description: task.description,
			objectives: task.objectives,
			date: task.date,
			templateInteractionType: template.interactionType,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			templateCadence: template.cadence,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, userLocalDateStr), eq(template.cadence, "daily")));

	return {
		weeklyTasks,
		dailyTasks,
		language,
	};
};

export const actions: Actions = {
	switchLanguage: async (event) => {
		const formData = await event.request.formData();
		const raw = { language: formData.get("language")?.toString() ?? "" };

		const result = switchLanguageSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { message: "Invalid language" });
		}

		await auth.api.updateUser({
			body: { activeLanguage: result.data.language },
			headers: event.request.headers,
		});

		const userId = event.locals.user?.id;
		if (!userId) return fail(401);

		// Ensure learning profile exists for the new language
		await db
			.insert(userLearningProfile)
			.values({
				userId,
				language: result.data.language,
			})
			.onConflictDoNothing();

		return redirect(302, "/");
	},
};
