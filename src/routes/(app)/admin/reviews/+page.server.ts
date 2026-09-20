import { eq } from "drizzle-orm";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { templateContribution, user } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);

	const pendingContributions = await db
		.select({
			id: templateContribution.id,
			titleBase: templateContribution.titleBase,
			language: templateContribution.language,
			interactionType: templateContribution.interactionType,
			ui: templateContribution.ui,
			submittedAt: templateContribution.submittedAt,
			contributorName: user.name,
			contributorEmail: user.email,
		})
		.from(templateContribution)
		.leftJoin(user, eq(templateContribution.createdBy, user.id))
		.where(eq(templateContribution.status, "pending"))
		.orderBy(templateContribution.submittedAt);

	return { pendingContributions };
};
