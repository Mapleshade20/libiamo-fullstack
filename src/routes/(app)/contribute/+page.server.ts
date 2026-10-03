import { fail, redirect } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { base } from "$app/paths";
import { taskContributionSchema } from "$lib/schemas";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
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

		await db.insert(taskContribution).values({ ...result.data, createdBy: user.id, status: "pending" });

		return redirect(302, `${base}/contribute?success=1`);
	},
};
