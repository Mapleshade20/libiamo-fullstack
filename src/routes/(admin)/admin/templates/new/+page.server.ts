import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseTemplateForm, prepareVariantPayload } from "$lib/admin/template-actions";
import { templateSchema } from "$lib/schemas";
import { db } from "$lib/server/db";
import { template, templateContribution, templateVariant } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const contributionId = event.url.searchParams.get("fromContribution");
	if (!contributionId) return { contributionData: null };

	const id = Number(contributionId);
	if (Number.isNaN(id)) return { contributionData: null };

	const [contribution] = await db.select().from(templateContribution).where(eq(templateContribution.id, id)).limit(1);

	return { contributionData: contribution ?? null };
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const raw = Object.fromEntries(formData);

		const result = templateSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		const userId = event.locals.user?.id;
		if (!userId) return fail(401);

		const isTranslate = result.data.interactionType === "translate";
		const fromContributionId = Number(formData.get("fromContributionId"));

		if (isTranslate) {
			await db.insert(template).values({
				...result.data,
				createdBy: userId,
			});
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
			});
		}

		// Mark contribution as approved if created from a contribution
		if (fromContributionId && !Number.isNaN(fromContributionId)) {
			await db.update(templateContribution).set({ status: "approved", reviewedBy: userId }).where(eq(templateContribution.id, fromContributionId));
		}

		return redirect(302, "/admin/templates");
	},
};
