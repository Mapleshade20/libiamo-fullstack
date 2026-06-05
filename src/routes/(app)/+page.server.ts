import { and, eq, inArray } from "drizzle-orm";
import type { LanguageCode } from "$lib/i18n";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { practiceSession, task, template } from "$lib/server/db/schema";
import { getGreeting, getRandomSubtitle } from "$lib/server/greetings";
import { getLocalDateString, getMondayOfWeekForDate } from "$lib/server/scheduling/dates";
import { ensureTasksForDate } from "$lib/server/scheduling/tasks";
import type { Actions, PageServerLoad } from "./$types";
import { switchActiveLanguage } from "./user-language-action";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
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
		greeting: getGreeting(language, user.name),
		subtitle: getRandomSubtitle(language),
	};
};

export const actions: Actions = {
	switchLanguage: switchActiveLanguage,
};
