import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { parseTemplateForm, prepareVariantPayload } from "$lib/admin/template-actions";
import { templateSchema } from "$lib/schemas";
import { db } from "$lib/server/db";
import { template, templateVariant } from "$lib/server/db/schema";
import type { Actions } from "./$types";

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

		// Translate templates don't use variants
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

			// Create template + first variant in a single transaction
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

		return redirect(302, "/admin/templates");
	},
};
