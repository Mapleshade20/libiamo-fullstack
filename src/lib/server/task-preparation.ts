import { and, eq } from "drizzle-orm";
import type { LanguageCode } from "$lib/i18n";
import type { HallQuestSessionStatus } from "$lib/quest-hall";
import { db } from "$lib/server/db";
import { user as authUser } from "$lib/server/db/auth.schema";
import { practiceSession, task, template } from "$lib/server/db/schema";

export interface TaskPreparationTask {
	id: number;
	title: string;
	description: string | null;
	objectives: string[] | null;
	language: LanguageCode;
	templateInteractionType: string;
	templateUi: string;
	templateDifficulty: number;
	materialsMd: string | null;
	pointReward: number;
	sessionStatus: HallQuestSessionStatus;
}

export interface TaskPreparationData {
	task: TaskPreparationTask;
	nativeLanguage: string | null;
}

interface GetTaskPreparationDataInput {
	userId: string;
	taskId: number;
}

export async function getTaskPreparationData({ userId, taskId }: GetTaskPreparationDataInput): Promise<TaskPreparationData | null> {
	const [result] = await db
		.select({
			id: task.id,
			title: task.title,
			description: task.description,
			objectives: task.objectives,
			language: task.language,
			templateInteractionType: template.interactionType,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			materialsMd: template.materialsMd,
			pointReward: template.pointReward,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(eq(task.id, taskId))
		.limit(1);

	if (!result) return null;

	const latestSession = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.taskId, taskId), eq(practiceSession.userId, userId)),
		orderBy: (sessions, { desc }) => [desc(sessions.startedAt), desc(sessions.id)],
		columns: {
			status: true,
		},
	});

	const [userRecord] = await db.select({ nativeLanguage: authUser.nativeLanguage }).from(authUser).where(eq(authUser.id, userId)).limit(1);

	return {
		task: {
			...result,
			sessionStatus: latestSession?.status ?? null,
		},
		nativeLanguage: userRecord?.nativeLanguage ?? null,
	};
}
