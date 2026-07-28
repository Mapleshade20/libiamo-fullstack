import { and, desc, eq } from "drizzle-orm";
import type { LanguageCode } from "$lib/i18n";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { template, translationAttempt, translationSourceSet } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const language = user.activeLanguage as LanguageCode;

	const templates = await db
		.select({
			id: template.id,
			titleBase: template.titleBase,
			shortObjectiveBase: template.shortObjectiveBase,
			difficulty: template.difficulty,
		})
		.from(template)
		.where(and(eq(template.language, language), eq(template.ui, "translator"), eq(template.isActive, true)));

	// Get latest attempt status for each template in the user's current native language.
	const attempts = user.nativeLanguage
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

	// Map: templateId → latest status
	const statusMap = new Map<number, string>();
	for (const a of attempts) {
		if (!statusMap.has(a.templateId)) {
			statusMap.set(a.templateId, a.status);
		}
	}

	return {
		templates,
		statusMap: Object.fromEntries(statusMap),
	};
};
