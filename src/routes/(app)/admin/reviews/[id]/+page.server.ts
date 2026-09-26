import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { base } from "$app/paths";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { taskContribution, user } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);

	const id = Number(event.params.id);
	if (Number.isNaN(id)) throw error(404, "Contribution not found");

	const [contribution] = await db
		.select({
			id: taskContribution.id,
			language: taskContribution.language,
			interactionType: taskContribution.interactionType,
			urgency: taskContribution.urgency,
			ui: taskContribution.ui,
			title: taskContribution.title,
			shortObjective: taskContribution.shortObjective,
			description: taskContribution.description,
			objectives: taskContribution.objectives,
			agentPrompt: taskContribution.agentPrompt,
			materialsMd: taskContribution.materialsMd,
			referenceParagraphs: taskContribution.referenceParagraphs,
			translationContext: taskContribution.translationContext,
			tags: taskContribution.tags,
			openingState: taskContribution.openingState,
			status: taskContribution.status,
			submittedAt: taskContribution.submittedAt,
			reviewNotes: taskContribution.reviewNotes,
			contributorName: user.name,
			contributorEmail: user.email,
		})
		.from(taskContribution)
		.leftJoin(user, eq(taskContribution.createdBy, user.id))
		.where(eq(taskContribution.id, id))
		.limit(1);

	if (!contribution) throw error(404, "Contribution not found");

	return { contribution };
};

export const actions: Actions = {
	reject: async (event) => {
		const admin = requireAdmin(event);

		const id = Number(event.params.id);
		if (Number.isNaN(id)) return fail(400);

		const [contribution] = await db.select({ status: taskContribution.status }).from(taskContribution).where(eq(taskContribution.id, id)).limit(1);

		if (!contribution) return fail(404, { message: "Contribution not found" });
		if (contribution.status !== "pending") return fail(400, { message: "Already reviewed" });

		const formData = await event.request.formData();
		const reviewNotes = (formData.get("reviewNotes") as string) || null;

		await db
			.update(taskContribution)
			.set({ status: "rejected", reviewedBy: admin.id, reviewNotes })
			.where(and(eq(taskContribution.id, id), eq(taskContribution.status, "pending")));

		throw redirect(302, `${base}/admin/reviews`);
	},
};
