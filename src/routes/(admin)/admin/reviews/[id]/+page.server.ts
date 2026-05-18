import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { templateContribution, user } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const id = Number(event.params.id);
	if (Number.isNaN(id)) throw error(404, "Contribution not found");

	const [contribution] = await db
		.select({
			id: templateContribution.id,
			language: templateContribution.language,
			interactionType: templateContribution.interactionType,
			ui: templateContribution.ui,
			titleBase: templateContribution.titleBase,
			shortObjectiveBase: templateContribution.shortObjectiveBase,
			descriptionBase: templateContribution.descriptionBase,
			objectivesBase: templateContribution.objectivesBase,
			agentPromptBase: templateContribution.agentPromptBase,
			materialsMd: templateContribution.materialsMd,
			translationBase: templateContribution.translationBase,
			tags: templateContribution.tags,
			slotValues: templateContribution.slotValues,
			openingState: templateContribution.openingState,
			difficulty: templateContribution.difficulty,
			cadence: templateContribution.cadence,
			status: templateContribution.status,
			submittedAt: templateContribution.submittedAt,
			reviewNotes: templateContribution.reviewNotes,
			contributorName: user.name,
			contributorEmail: user.email,
		})
		.from(templateContribution)
		.leftJoin(user, eq(templateContribution.createdBy, user.id))
		.where(eq(templateContribution.id, id))
		.limit(1);

	if (!contribution) throw error(404, "Contribution not found");

	return { contribution };
};

export const actions: Actions = {
	reject: async (event) => {
		const adminId = event.locals.user?.id;
		if (!adminId) throw redirect(302, "/sign-in");

		const id = Number(event.params.id);
		if (Number.isNaN(id)) return fail(400);

		const formData = await event.request.formData();
		const reviewNotes = (formData.get("reviewNotes") as string) || null;

		await db.update(templateContribution).set({ status: "rejected", reviewedBy: adminId, reviewNotes }).where(eq(templateContribution.id, id));

		throw redirect(302, "/admin/reviews");
	},
};
