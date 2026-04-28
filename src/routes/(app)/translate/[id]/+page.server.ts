import { error, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { LanguageCode } from "$lib/constants";
import { db } from "$lib/server/db";
import { template } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) return redirect(302, "/sign-in");

	const templateId = Number(event.params.id);
	if (Number.isNaN(templateId)) {
		return error(404, "Template not found");
	}

	const [tpl] = await db
		.select({
			id: template.id,
			title: template.titleBase,
			description: template.descriptionBase,
			shortObjective: template.shortObjectiveBase,
			language: template.language,
			materialsMd: template.materialsMd,
			passages: template.passagesBase,
			difficulty: template.difficulty,
			estimatedWords: template.estimatedWords,
			pointReward: template.pointReward,
			gemReward: template.gemReward,
		})
		.from(template)
		.where(
			and(
				eq(template.id, templateId),
				eq(template.interactionType, "translate"),
				eq(template.isActive, true),
				eq(template.language, user.activeLanguage as LanguageCode),
			),
		)
		.limit(1);

	if (!tpl) {
		return error(404, "Translation template not found");
	}

	return { template: tpl };
};
