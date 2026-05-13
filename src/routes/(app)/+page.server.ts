import { fail, redirect } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import type { LanguageCode } from "$lib/i18n";
import { switchLanguageSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth";
import { getLocalDateString, getMondayOfWeekForDate } from "$lib/server/dates";
import { db } from "$lib/server/db";
import { practiceSession, task, template, userLearningProfile } from "$lib/server/db/schema";
import { ensureTasksForDate } from "$lib/server/tasks";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) return redirect(302, "/sign-in");
	const language = user.activeLanguage as LanguageCode;

	const userTz = user.timezone || "UTC";
	const userLocalDateStr = getLocalDateString(userTz);

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
			cadence: task.cadence,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, mondayStr), eq(task.cadence, "weekly")));

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
			cadence: task.cadence,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, userLocalDateStr), eq(task.cadence, "daily")));

	const allTaskIds = [...new Set([...weeklyTasks, ...dailyTasks].map((taskItem) => taskItem.id))];

	const relatedSessions =
		allTaskIds.length > 0
			? await db.query.practiceSession.findMany({
					where: and(eq(practiceSession.userId, user.id), inArray(practiceSession.taskId, allTaskIds)),
					columns: {
						id: true,
						taskId: true,
						status: true,
						startedAt: true,
					},
					orderBy: (sessions, { desc }) => [desc(sessions.startedAt), desc(sessions.id)],
				})
			: [];

	const latestSessionStatusByTaskId = new Map<number, (typeof relatedSessions)[number]["status"]>();
	for (const session of relatedSessions) {
		if (!latestSessionStatusByTaskId.has(session.taskId)) {
			latestSessionStatusByTaskId.set(session.taskId, session.status);
		}
	}

	return {
		weeklyTasks: weeklyTasks.map((taskItem) => ({
			...taskItem,
			sessionStatus: latestSessionStatusByTaskId.get(taskItem.id) ?? null,
		})),
		dailyTasks: dailyTasks.map((taskItem) => ({
			...taskItem,
			sessionStatus: latestSessionStatusByTaskId.get(taskItem.id) ?? null,
		})),
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
