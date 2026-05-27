import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "$lib/server/admin-auth";
import { db } from "$lib/server/db";
import { templateContribution } from "$lib/server/db/schema";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
	const user = requireAdmin(event);

	const [result] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(templateContribution)
		.where(eq(templateContribution.status, "pending"));

	return { user, pendingReviewCount: result?.count ?? 0 };
};
