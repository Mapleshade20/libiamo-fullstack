import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { base } from "$app/paths";
import { parseTaskForm, parseTaskJson } from "$lib/admin/task-actions";
import { ContributionAlreadyReviewedError, createTask } from "$lib/server/admin/tasks";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { taskContribution } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);

	const contributionId = Number(event.url.searchParams.get("fromContribution"));
	if (!Number.isSafeInteger(contributionId) || contributionId <= 0) return { contributionData: null };

	const [contribution] = await db.select().from(taskContribution).where(eq(taskContribution.id, contributionId)).limit(1);
	return { contributionData: contribution ?? null };
};

export const actions: Actions = {
	create: async (event) => {
		const admin = requireAdmin(event);

		const formData = await event.request.formData();
		const parsed = parseTaskForm(formData);
		if (!parsed.success) return fail(400, { errors: parsed.errors, values: parsed.values });

		const fromContributionId = Number(formData.get("fromContributionId"));
		const hasContribution = Number.isSafeInteger(fromContributionId) && fromContributionId > 0;
		if (hasContribution) {
			const [contribution] = await db
				.select({ status: taskContribution.status })
				.from(taskContribution)
				.where(eq(taskContribution.id, fromContributionId))
				.limit(1);
			if (!contribution) return fail(404, { message: "Contribution not found" });
			if (contribution.status !== "pending") return fail(400, { message: "Already reviewed" });
		}

		let taskId: number;
		try {
			taskId = await createTask(parsed.task, {
				createdBy: admin.id,
				rotation: parsed.rotation,
				approveContributionId: hasContribution ? fromContributionId : undefined,
			});
		} catch (cause) {
			if (cause instanceof ContributionAlreadyReviewedError) return fail(400, { message: cause.message });
			throw cause;
		}

		return redirect(302, `${base}/admin/tasks/${taskId}`);
	},

	importJson: async (event) => {
		const admin = requireAdmin(event);

		const rawJson = (await event.request.formData()).get("taskJson");
		if (typeof rawJson !== "string" || rawJson.trim() === "") return fail(400, { message: "Paste task JSON before importing." });

		const result = parseTaskJson(rawJson);
		if (!result.success) return fail(400, { message: result.error });

		const taskId = await createTask(result.data.task, { createdBy: admin.id, rotation: result.data.rotation, isActive: result.data.isActive });
		return redirect(302, `${base}/admin/tasks/${taskId}`);
	},
};
