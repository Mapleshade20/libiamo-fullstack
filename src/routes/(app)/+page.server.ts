import { and, desc, eq, inArray } from "drizzle-orm";
import type { LanguageCode } from "$lib/i18n";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { practiceSession, task, template, translationAttempt, translationSourceSet } from "$lib/server/db/schema";
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
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			templateInteractionType: template.interactionType,
			pointReward: template.pointReward,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, mondayStr), eq(task.cadence, "weekly")));

	const dailyTasks = await db
		.select({
			id: task.id,
			title: task.title,
			shortObjective: task.shortObjective,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			templateInteractionType: template.interactionType,
			pointReward: template.pointReward,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, userLocalDateStr), eq(task.cadence, "daily")));

	const translationTasks = await db
		.select({
			id: template.id,
			titleBase: template.titleBase,
			descriptionBase: template.descriptionBase,
			difficulty: template.difficulty,
			createdAt: template.createdAt,
		})
		.from(template)
		.where(and(eq(template.language, language), eq(template.ui, "translator"), eq(template.isActive, true)));

	const translationAttempts = user.nativeLanguage
		? await db
				.select({
					templateId: translationSourceSet.templateId,
					status: translationAttempt.workflowPhase,
				})
				.from(translationAttempt)
				.innerJoin(translationSourceSet, eq(translationAttempt.sourceSetId, translationSourceSet.id))
				.where(and(eq(translationAttempt.userId, user.id), eq(translationSourceSet.promptLanguage, user.nativeLanguage)))
				.orderBy(desc(translationAttempt.updatedAt))
		: [];

	const translationStatusByTemplateId = new Map<number, string>();
	for (const attempt of translationAttempts) {
		if (!translationStatusByTemplateId.has(attempt.templateId)) {
			translationStatusByTemplateId.set(attempt.templateId, attempt.status);
		}
	}

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
						lastSeenAssistantMessageId: true,
					},
					with: {
						messages: {
							columns: { id: true, role: true },
						},
					},
					orderBy: (sessions, { desc }) => [desc(sessions.startedAt), desc(sessions.id)],
				})
			: [];

	const latestSessionByTaskId = new Map<number, (typeof relatedSessions)[number]>();
	for (const session of relatedSessions) {
		if (!latestSessionByTaskId.has(session.taskId)) {
			latestSessionByTaskId.set(session.taskId, session);
		}
	}
	const addSessionState = <T extends { id: number }>(taskItem: T) => {
		const session = latestSessionByTaskId.get(taskItem.id);
		const latestAssistantId =
			session?.messages?.reduce((latest, message) => (message.role === "assistant" ? Math.max(latest, message.id) : latest), 0) ?? 0;
		return {
			...taskItem,
			sessionStatus: session?.status ?? null,
			hasUnreadReply: latestAssistantId > (session?.lastSeenAssistantMessageId ?? 0),
		};
	};

	return {
		weeklyTasks: weeklyTasks.map(addSessionState),
		dailyTasks: dailyTasks.map(addSessionState),
		translationTasks: translationTasks.map(({ createdAt, ...taskItem }) => ({
			...taskItem,
			createdMonth: getLocalDateString(userTz, createdAt).slice(0, 7),
		})),
		translationStatusMap: Object.fromEntries(translationStatusByTemplateId),
		translationMonth: userLocalDateStr.slice(0, 7),
		editionDate: userLocalDateStr,
		greeting: getGreeting(language, user.name),
		subtitle: getRandomSubtitle(language),
	};
};

export const actions: Actions = {
	switchLanguage: switchActiveLanguage,
};
