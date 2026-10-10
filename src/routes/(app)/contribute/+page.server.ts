import { fail, redirect } from "@sveltejs/kit";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { base } from "$app/paths";
import { PENDING_CONTRIBUTION_LIMIT } from "$lib/constants";
import { taskContributionSchema } from "$lib/schemas";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { user as authUser } from "$lib/server/db/auth.schema";
import { taskContribution } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	if (user.role === "admin") throw redirect(302, `${base}/`);

	const contributions = await db
		.select({
			id: taskContribution.id,
			title: taskContribution.title,
			interactionType: taskContribution.interactionType,
			ui: taskContribution.ui,
			status: taskContribution.status,
			submittedAt: taskContribution.submittedAt,
			reviewNotes: taskContribution.reviewNotes,
		})
		.from(taskContribution)
		.where(eq(taskContribution.createdBy, user.id))
		.orderBy(desc(taskContribution.submittedAt));

	return { contributions };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireUser(event);

		const raw = Object.fromEntries(await event.request.formData());
		const result = taskContributionSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		// The user row lock makes the count and the insert one step, so a burst cannot all pass the limit.
		const accepted = await db.transaction(async (tx) => {
			await tx.select({ id: authUser.id }).from(authUser).where(eq(authUser.id, user.id)).for("update");
			const [{ pending }] = await tx
				.select({ pending: count() })
				.from(taskContribution)
				.where(and(eq(taskContribution.createdBy, user.id), eq(taskContribution.status, "pending")));
			if (pending >= PENDING_CONTRIBUTION_LIMIT) return false;
			await tx.insert(taskContribution).values({ ...result.data, createdBy: user.id, status: "pending" });
			return true;
		});
		if (!accepted) {
			return fail(429, {
				message: `You already have ${PENDING_CONTRIBUTION_LIMIT} tasks waiting for review. You can submit more once they are reviewed.`,
				values: raw,
			});
		}

		return redirect(302, `${base}/contribute?success=1`);
	},
};
