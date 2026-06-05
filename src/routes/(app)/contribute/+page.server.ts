import { fail, redirect } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { parseTemplateForm, prepareVariantPayload } from "$lib/admin/template-actions";
import { USER_TEXT_MAX_LENGTH } from "$lib/constants";
import { templateContributionSchema } from "$lib/schemas";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { templateContribution } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

function hasOversizedSlotValues(slotValues: Record<string, string>) {
	return Object.entries(slotValues).some(([key, value]) => key.length > USER_TEXT_MAX_LENGTH || value.length > USER_TEXT_MAX_LENGTH);
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
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
		const user = requireUser(event);

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
				createdBy: user.id,
				status: "pending",
				submittedAt: new Date(),
			});
		} else {
			const parsed = parseTemplateForm(formData);
			if (hasOversizedSlotValues(parsed.slotValues)) {
				return fail(400, { message: "Slot values are too long", values: raw });
			}
			const variantResult = prepareVariantPayload(result.data, parsed.slotValues, parsed.openingState, "First variant");
			if (variantResult.error) {
				return fail(400, { message: variantResult.error, values: raw });
			}

			await db.insert(templateContribution).values({
				...result.data,
				createdBy: user.id,
				status: "pending",
				submittedAt: new Date(),
				slotValues: variantResult.slotValues,
				openingState: variantResult.openingState,
			});
		}

		return redirect(302, "/contribute?success=1");
	},
};
