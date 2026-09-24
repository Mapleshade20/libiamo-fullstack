import { and, eq, type SQL } from "drizzle-orm";
import { type InteractionType, isLanguageCode } from "$lib/constants";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { lineupRotation, task } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);

	const languageParam = event.url.searchParams.get("language");
	const language = isLanguageCode(languageParam) ? languageParam : null;
	const interactionType = event.url.searchParams.get("interactionType");
	const active = event.url.searchParams.get("active");

	const conditions: SQL[] = [];
	if (language) conditions.push(eq(task.language, language));
	if (interactionType === "chat" || interactionType === "translate") conditions.push(eq(task.interactionType, interactionType as InteractionType));
	if (active === "true") conditions.push(eq(task.isActive, true));
	if (active === "false") conditions.push(eq(task.isActive, false));

	const tasks = await db
		.select({
			id: task.id,
			title: task.title,
			language: task.language,
			interactionType: task.interactionType,
			ui: task.ui,
			tags: task.tags,
			isActive: task.isActive,
			rotation: lineupRotation.kind,
		})
		.from(task)
		.leftJoin(lineupRotation, eq(lineupRotation.taskId, task.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(task.id);

	return {
		tasks,
		filters: { language, interactionType, active },
	};
};
