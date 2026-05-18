import { fail, redirect } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { parseTemplateForm, prepareVariantPayload } from "$lib/admin/template-actions";
import { templateContributionSchema } from "$lib/schemas";
import { db } from "$lib/server/db";
import { templateContribution } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) throw redirect(302, "/sign-in");
	if (user.role === "admin") throw redirect(302, "/");

	const contributions = await db
		.select({
			id: templateContribution.id,
			titleBase: templateContribution.titleBase,
			interactionType: templateContribution.interactionType,
			ui: templateContribution.ui,
			status: templateContribution.status,
			submittedAt: templateContribution.submittedAt,
			reviewNotes: templateContribution.reviewNotes,
		})
		.from(templateContribution)
		.where(eq(templateContribution.createdBy, user.id))
		.orderBy(desc(templateContribution.submittedAt));

	return { contributions };
};

export const actions: Actions = {
	default: async (event) => {
		const userId = event.locals.user?.id;
		if (!userId) throw redirect(302, "/sign-in");

		const formData = await event.request.formData();
		const raw = Object.fromEntries(formData);

		const result = templateContributionSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		const isTranslate = result.data.interactionType === "translate";

		if (isTranslate) {
			await db.insert(templateContribution).values({
				...result.data,
				createdBy: userId,
				status: "pending",
				submittedAt: new Date(),
			});
		} else {
			const parsed = parseTemplateForm(formData);
			const variantResult = prepareVariantPayload(result.data, parsed.slotValues, parsed.openingState, "First variant");
			if (variantResult.error) {
				return fail(400, { message: variantResult.error, values: raw });
			}

			await db.insert(templateContribution).values({
				...result.data,
				createdBy: userId,
				status: "pending",
				submittedAt: new Date(),
				slotValues: variantResult.slotValues,
				openingState: variantResult.openingState,
			});
		}

		return redirect(302, "/contribute?success=1");
	},
};
