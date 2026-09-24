import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getSelfAssignedLevel, type LanguageCode, type SelfAssignedLevel, type TranslationWorkflowPhase } from "$lib/constants";
import type { HallQuest, HallQuestSessionStatus } from "$lib/quest-hall/quest";
import { db } from "$lib/server/db";
import { practiceSession, task, translationAttempt, translationSourceSet } from "$lib/server/db/schema";
import { unreadReplyCount } from "$lib/server/practice/unread";
import { getGreeting, getRandomSubtitle } from "$lib/server/quest-hall/greetings";
import { getLocalDateString } from "$lib/server/task/lineup-dates";
import { currentLineupStarts, ensureCurrentLineups, listLineupTasks } from "$lib/server/task/lineups";

export interface QuestHallUser {
	id: string;
	name: string;
	activeLanguage: string;
	nativeLanguage?: string | null;
}

export interface HallTranslationTask {
	id: number;
	title: string;
	description: string | null;
	difficulty: number;
	createdMonth: string;
}

export interface HallData {
	activeLanguage: LanguageCode;
	nativeLanguage: string | null;
	levelSelfAssign: SelfAssignedLevel;
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

async function loadLineupQuests(lineupId: number, userId: string): Promise<HallQuest[]> {
	const entries = await listLineupTasks(lineupId);
	const sessions =
		entries.length > 0
			? await db
					.select({
						taskId: practiceSession.taskId,
						status: practiceSession.status,
						evaluationPhase: practiceSession.evaluationPhase,
						unreadCount: unreadReplyCount,
					})
					.from(practiceSession)
					.where(and(eq(practiceSession.userId, userId), eq(practiceSession.lineupId, lineupId)))
			: [];
	const sessionByTaskId = new Map(sessions.map((session) => [session.taskId, session]));

	return entries.map(({ origin: _origin, ...entry }) => {
		const session = sessionByTaskId.get(entry.id);
		const unreadCount = session?.unreadCount ?? 0;
		return {
			...entry,
			lineupId,
			sessionStatus: (session?.status ?? null) as HallQuestSessionStatus,
			evaluationPhase: session?.evaluationPhase ?? null,
			unreadCount,
			hasUnreadReply: unreadCount > 0,
		};
	});
}

export async function loadQuestHallData(user: QuestHallUser, browserTimezone: string): Promise<HallData> {
	const activeLanguage = user.activeLanguage as LanguageCode;
	const localDate = getLocalDateString(browserTimezone);
	const lineups = await ensureCurrentLineups(activeLanguage, localDate);
	const learner = await db.query.user.findFirst({
		where: (u, { eq }) => eq(u.id, user.id),
		columns: { levelSelfAssign: true },
	});

	const [dailyTasks, weeklyTasks] = await Promise.all([loadLineupQuests(lineups.daily, user.id), loadLineupQuests(lineups.weekly, user.id)]);

	const translationTasks = await db
		.select({
			id: task.id,
			title: task.title,
			description: task.description,
			difficulty: task.difficulty,
			createdAt: task.createdAt,
		})
		.from(task)
		.where(and(eq(task.language, activeLanguage), eq(task.interactionType, "translate"), eq(task.isActive, true)))
		.orderBy(desc(task.createdAt), desc(task.id));

	const translationTaskIds = translationTasks.map((taskItem) => taskItem.id);
	const translationAttempts =
		user.nativeLanguage && translationTaskIds.length > 0
			? await db
					.select({
						taskId: translationAttempt.taskId,
						status: translationAttempt.workflowPhase,
					})
					.from(translationAttempt)
					.innerJoin(translationSourceSet, eq(translationAttempt.sourceSetId, translationSourceSet.id))
					.where(
						and(
							eq(translationAttempt.userId, user.id),
							eq(translationSourceSet.promptLanguage, user.nativeLanguage),
							inArray(translationAttempt.taskId, translationTaskIds),
						),
					)
					.orderBy(sql`${translationAttempt.workflowPhase} <> 'completed' DESC`, desc(translationAttempt.updatedAt), desc(translationAttempt.id))
			: [];

	const translationStatusByTaskId = new Map<number, TranslationWorkflowPhase>();
	for (const attempt of translationAttempts) {
		if (!translationStatusByTaskId.has(attempt.taskId)) {
			translationStatusByTaskId.set(attempt.taskId, attempt.status);
		}
	}

	return {
		activeLanguage,
		nativeLanguage: user.nativeLanguage ?? null,
		levelSelfAssign: getSelfAssignedLevel(learner?.levelSelfAssign, activeLanguage),
		localDate,
		localMonday: currentLineupStarts(localDate).weekly,
		editionDate: localDate,
		translationMonth: localDate.slice(0, 7),
		greeting: getGreeting(activeLanguage, user.name),
		subtitle: getRandomSubtitle(activeLanguage),
		weeklyTasks,
		dailyTasks,
		translationTasks: translationTasks.map(({ createdAt, ...taskItem }) => ({
			...taskItem,
			createdMonth: getLocalDateString(browserTimezone, createdAt).slice(0, 7),
		})),
		translationStatusMap: Object.fromEntries(translationStatusByTaskId),
	};
}
