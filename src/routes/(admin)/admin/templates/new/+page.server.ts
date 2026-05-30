import { fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { parseTemplateForm, prepareVariantPayload } from "$lib/admin/template-actions";
import { templateSchema } from "$lib/schemas";
import { requireAdmin } from "$lib/server/authz";
import { db } from "$lib/server/db";
import { template, templateContribution, templateVariant } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);

	const contributionId = event.url.searchParams.get("fromContribution");
	if (!contributionId) return { contributionData: null };

	const id = Number(contributionId);
	if (Number.isNaN(id)) return { contributionData: null };

	const [contribution] = await db.select().from(templateContribution).where(eq(templateContribution.id, id)).limit(1);

	return { contributionData: contribution ?? null };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireAdmin(event);

		const formData = await event.request.formData();
		const raw = Object.fromEntries(formData);

		const result = templateSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		const userId = user.id;

		const isTranslate = result.data.interactionType === "translate";
		const fromContributionId = Number(formData.get("fromContributionId"));
		const hasContribution = fromContributionId && !Number.isNaN(fromContributionId);

		// Verify the contribution exists and is pending before proceeding
		if (hasContribution) {
			const [contribution] = await db
				.select({ status: templateContribution.status })
				.from(templateContribution)
				.where(eq(templateContribution.id, fromContributionId))
				.limit(1);

			if (!contribution) return fail(404, { message: "Contribution not found" });
			if (contribution.status !== "pending") return fail(400, { message: "Already reviewed" });
		}

		if (isTranslate) {
			if (hasContribution) {
				await db.transaction(async (tx) => {
					await tx.insert(template).values({
						...result.data,
						createdBy: userId,
					});
					await tx
						.update(templateContribution)
						.set({ status: "approved", reviewedBy: userId })
						.where(and(eq(templateContribution.id, fromContributionId), eq(templateContribution.status, "pending")));
				});
			} else {
				await db.insert(template).values({
					...result.data,
					createdBy: userId,
				});
			}
		} else {
			const parsed = parseTemplateForm(formData);
			const variantResult = prepareVariantPayload(result.data, parsed.slotValues, parsed.openingState, "First variant");
			if (variantResult.error) {
				return fail(400, { message: variantResult.error, values: raw });
			}

			await db.transaction(async (tx) => {
				const [newTemplate] = await tx
					.insert(template)
					.values({
						...result.data,
						createdBy: userId,
					})
					.returning({ id: template.id });

				await tx.insert(templateVariant).values({
					templateId: newTemplate.id,
					isActive: true,
					slotValues: variantResult.slotValues,
					openingState: variantResult.openingState,
				});

				if (hasContribution) {
					await tx
						.update(templateContribution)
						.set({ status: "approved", reviewedBy: userId })
						.where(and(eq(templateContribution.id, fromContributionId), eq(templateContribution.status, "pending")));
				}
			});
		}

		return redirect(302, "/admin/templates");
	},
};
