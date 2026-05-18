import { redirect } from "@sveltejs/kit";
import { eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { templateContribution } from "$lib/server/db/schema";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, "/sign-in");
	}
	if (event.locals.user.role !== "admin") {
		return redirect(302, "/");
	}

	const [result] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(templateContribution)
		.where(eq(templateContribution.status, "pending"));

	return { user: event.locals.user, pendingReviewCount: result?.count ?? 0 };
};
