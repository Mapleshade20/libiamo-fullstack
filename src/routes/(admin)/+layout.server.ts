import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { templateContribution } from "$lib/server/db/schema";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
	const user = requireAdmin(event);

	const [result] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(templateContribution)
		.where(eq(templateContribution.status, "pending"));

	return {
		user: {
			name: user.name,
			email: user.email,
			role: user.role,
			activeLanguage: user.activeLanguage,
		},
		pendingReviewCount: result?.count ?? 0,
	};
};
