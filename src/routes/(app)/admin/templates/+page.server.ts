import { and, eq, type SQL } from "drizzle-orm";
import type { InteractionType, LanguageCode } from "$lib/constants";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { template } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);

	const language = event.url.searchParams.get("language") as LanguageCode | null;
	const interactionType = event.url.searchParams.get("interactionType");
	const active = event.url.searchParams.get("active");

	const conditions: SQL[] = [];
	if (language) conditions.push(eq(template.language, language));
	if (interactionType) conditions.push(eq(template.interactionType, interactionType as InteractionType));
	if (active === "true") conditions.push(eq(template.isActive, true));
	if (active === "false") conditions.push(eq(template.isActive, false));

	const templates = await db
		.select()
		.from(template)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(template.id);

	return {
		templates,
		filters: { language, interactionType, active },
	};
};
