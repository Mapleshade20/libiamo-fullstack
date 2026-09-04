import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { InteractionType, LanguageCode, TranslationWorkflowPhase, UiVariant } from "$lib/constants";
import type { HallQuest, HallQuestSessionStatus } from "$lib/quest-hall";
import { db } from "$lib/server/db";
import { practiceSession, task, template, translationAttempt, translationSourceSet } from "$lib/server/db/schema";
import { getGreeting, getRandomSubtitle } from "$lib/server/greetings";
import { getLocalDateString, getMondayOfWeekForDate } from "$lib/server/scheduling/dates";
import { ensureTasksForDate } from "$lib/server/scheduling/tasks";

export interface QuestHallUser {
	id: string;
	name: string;
	activeLanguage: string;
	nativeLanguage?: string | null;
}

export interface HallTranslationTask {
	id: number;
	titleBase: string;
	descriptionBase: string | null;
	difficulty: number;
	createdMonth: string;
}

export interface HallData {
	activeLanguage: LanguageCode;
	nativeLanguage: string | null;
	localDate: string;
	localMonday: string;
	editionDate: string;
	translationMonth: string;
	greeting: string;
	subtitle: string;
	dailyTasks: HallQuest[];
	weeklyTasks: HallQuest[];
	translationTasks: HallTranslationTask[];
	translationStatusMap: Record<string, TranslationWorkflowPhase>;
}

interface ScheduledHallTask {
	id: number;
	title: string;
	shortObjective: string | null;
	templateUi: UiVariant;
	templateDifficulty: number;
	templateInteractionType: InteractionType;
	pointReward: number;
}

export async function loadQuestHallData(user: QuestHallUser, browserTimezone: string): Promise<HallData> {
	const activeLanguage = user.activeLanguage as LanguageCode;
	const localDate = getLocalDateString(browserTimezone);
	const localMonday = getMondayOfWeekForDate(localDate);

	await ensureTasksForDate(activeLanguage, localDate);

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
		.where(and(eq(task.language, activeLanguage), eq(task.date, localMonday), eq(task.cadence, "weekly")))
		.orderBy(asc(task.id));

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
		.where(and(eq(task.language, activeLanguage), eq(task.date, localDate), eq(task.cadence, "daily")))
		.orderBy(asc(task.id));

	const translationTasks = await db
		.select({
			id: template.id,
			titleBase: template.titleBase,
			descriptionBase: template.descriptionBase,
			difficulty: template.difficulty,
			createdAt: template.createdAt,
		})
		.from(template)
		.where(and(eq(template.language, activeLanguage), eq(template.ui, "translator"), eq(template.isActive, true)))
		.orderBy(desc(template.createdAt), desc(template.id));

	const translationTemplateIds = translationTasks.map((taskItem) => taskItem.id);
	const translationAttempts =
		user.nativeLanguage && translationTemplateIds.length > 0
			? await db
					.select({
						templateId: translationSourceSet.templateId,
						status: translationAttempt.workflowPhase,
					})
					.from(translationAttempt)
					.innerJoin(translationSourceSet, eq(translationAttempt.sourceSetId, translationSourceSet.id))
					.where(
						and(
							eq(translationAttempt.userId, user.id),
							eq(translationSourceSet.promptLanguage, user.nativeLanguage),
							inArray(translationSourceSet.templateId, translationTemplateIds),
						),
					)
					.orderBy(sql`${translationAttempt.workflowPhase} <> 'completed' DESC`, desc(translationAttempt.updatedAt), desc(translationAttempt.id))
			: [];

	const translationStatusByTemplateId = new Map<number, TranslationWorkflowPhase>();
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

	const addSessionState = (taskItem: ScheduledHallTask): HallQuest => {
		const session = latestSessionByTaskId.get(taskItem.id);
		const seenWatermark = session?.lastSeenAssistantMessageId ?? 0;
		const unreadCount = session?.messages?.filter((message) => message.role === "assistant" && message.id > seenWatermark).length ?? 0;
		return {
			...taskItem,
			sessionStatus: (session?.status ?? null) as HallQuestSessionStatus,
			unreadCount,
			hasUnreadReply: unreadCount > 0,
		};
	};

	return {
		activeLanguage,
		nativeLanguage: user.nativeLanguage ?? null,
		localDate,
		localMonday,
		editionDate: localDate,
		translationMonth: localDate.slice(0, 7),
		greeting: getGreeting(activeLanguage, user.name),
		subtitle: getRandomSubtitle(activeLanguage),
		weeklyTasks: weeklyTasks.map(addSessionState),
		dailyTasks: dailyTasks.map(addSessionState),
		translationTasks: translationTasks.map(({ createdAt, ...taskItem }) => ({
			...taskItem,
			createdMonth: getLocalDateString(browserTimezone, createdAt).slice(0, 7),
		})),
		translationStatusMap: Object.fromEntries(translationStatusByTemplateId),
	};
}
