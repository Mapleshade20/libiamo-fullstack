import { redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { LanguageCode } from "$lib/i18n";
import { db } from "$lib/server/db";
import { template } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) return redirect(302, "/sign-in");
	const language = user.activeLanguage as LanguageCode;

	const templates = await db
		.select({
			id: template.id,
			titleBase: template.titleBase,
			shortObjectiveBase: template.shortObjectiveBase,
			difficulty: template.difficulty,
			interactionType: template.interactionType,
		})
		.from(template)
		.where(and(eq(template.language, language), eq(template.ui, "translator"), eq(template.isActive, true)));

	return {
		templates,
		language,
	};
};
