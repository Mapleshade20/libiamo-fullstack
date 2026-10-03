import { eq } from "drizzle-orm";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { taskContribution, user } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);

	const pendingContributions = await db
		.select({
			id: taskContribution.id,
			title: taskContribution.title,
			language: taskContribution.language,
			interactionType: taskContribution.interactionType,
			ui: taskContribution.ui,
			submittedAt: taskContribution.submittedAt,
			contributorName: user.name,
			contributorEmail: user.email,
		})
		.from(taskContribution)
		.leftJoin(user, eq(taskContribution.createdBy, user.id))
		.where(eq(taskContribution.status, "pending"))
		.orderBy(taskContribution.submittedAt);

	return { pendingContributions };
};
