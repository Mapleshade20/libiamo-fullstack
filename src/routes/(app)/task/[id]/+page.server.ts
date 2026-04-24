import { error, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { LanguageCode } from "$lib/constants";
import { db } from "$lib/server/db";
import { practiceSession, task, template, templateVariant } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) return redirect(302, "/sign-in");
	const taskId = Number(event.params.id);

	if (Number.isNaN(taskId)) {
		return error(404, "Task not found");
	}

	const [result] = await db
		.select({
			id: task.id,
			title: task.title,
			description: task.description,
			objectives: task.objectives,
			date: task.date,
			language: task.language,
			templateInteractionType: template.interactionType,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			materialsMd: template.materialsMd,
			estimatedWords: template.estimatedWords,
			maxTurns: template.maxTurns,
			pointReward: template.pointReward,
			gemReward: template.gemReward,
			openingState: templateVariant.openingState,
			sessionStatus: practiceSession.status,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.leftJoin(templateVariant, eq(task.variantId, templateVariant.id))
		.leftJoin(practiceSession, and(eq(practiceSession.taskId, task.id), eq(practiceSession.userId, user.id)))
		.where(and(eq(task.id, taskId), eq(task.language, user.activeLanguage as LanguageCode)))
		.limit(1);

	if (!result) {
		return error(404, "Task not found");
	}

	return { task: result };
};
