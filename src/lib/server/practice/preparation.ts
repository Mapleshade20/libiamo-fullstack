import { eq } from "drizzle-orm";
import type { LanguageCode, PracticeEvaluationPhase, UiVariant } from "$lib/constants";
import type { HallQuestSessionStatus } from "$lib/quest-hall/quest";
import { db } from "$lib/server/db";
import { user as authUser } from "$lib/server/db/auth.schema";
import { task } from "$lib/server/db/schema";
import { findPracticeSession } from "$lib/server/task/context";
import type { AttemptContext } from "$lib/task/attempts";

export interface TaskPreparationTask {
	id: number;
	title: string;
	description: string | null;
	objectives: string[] | null;
	language: LanguageCode;
	ui: UiVariant;
	difficulty: number;
	materialsMd: string | null;
	sessionStatus: HallQuestSessionStatus;
	evaluationPhase: PracticeEvaluationPhase | null;
}

export interface TaskPreparationData {
	task: TaskPreparationTask;
	nativeLanguage: string | null;
}

interface GetTaskPreparationDataInput {
	userId: string;
	taskId: number;
	context: AttemptContext;
}

export async function getTaskPreparationData({ userId, taskId, context }: GetTaskPreparationDataInput): Promise<TaskPreparationData | null> {
	const [result] = await db
		.select({
			id: task.id,
			interactionType: task.interactionType,
			title: task.title,
			description: task.description,
			objectives: task.objectives,
			language: task.language,
			ui: task.ui,
			difficulty: task.difficulty,
			materialsMd: task.materialsMd,
		})
		.from(task)
		.where(eq(task.id, taskId))
		.limit(1);

	if (!result || result.interactionType !== "chat") return null;
	const { interactionType: _interactionType, ...details } = result;

	const shownSession = await findPracticeSession(userId, taskId, context);
	const [userRecord] = await db.select({ nativeLanguage: authUser.nativeLanguage }).from(authUser).where(eq(authUser.id, userId)).limit(1);

	return {
		task: {
			...details,
			sessionStatus: shownSession?.status ?? null,
			evaluationPhase: shownSession?.evaluationPhase ?? null,
		},
		nativeLanguage: userRecord?.nativeLanguage ?? null,
	};
}
