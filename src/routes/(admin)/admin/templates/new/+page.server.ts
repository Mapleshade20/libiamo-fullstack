import { fail, redirect } from "@sveltejs/kit";
import { extractSlotNames, getMissingSlots, parseJsonField, parseSlotValues } from "$lib/admin/variant-helpers";
import { templateSchema, validateOpeningState } from "$lib/schemas";
import { db } from "$lib/server/db";
import { template, templateVariant } from "$lib/server/db/schema";
import type { Actions } from "./$types";

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const raw = Object.fromEntries(formData);

		const result = templateSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: result.error.flatten().fieldErrors, values: raw });
		}

		const userId = event.locals.user?.id;
		if (!userId) return fail(401);

		const slotValues = parseSlotValues(formData.get("firstVariantSlotValues"));
		const openingState = parseJsonField(formData.get("firstVariantOpeningState"));

		// Validate opening state against selected UI schema
		const ui = result.data.ui;
		const osValidation = validateOpeningState(ui, openingState);
		if (!osValidation?.success) {
			return fail(400, {
				message: `Invalid opening state for ${ui}: ${osValidation?.error?.message ?? "validation failed"}`,
				values: raw,
			});
		}

		// Validate slot coverage
		const requiredSlots = extractSlotNames({
			titleBase: result.data.titleBase,
			shortObjectiveBase: result.data.shortObjectiveBase ?? null,
			descriptionBase: result.data.descriptionBase ?? null,
			agentPromptBase: result.data.agentPromptBase ?? null,
			objectivesBase: result.data.objectivesBase ?? null,
		});
		const missingSlots = getMissingSlots(slotValues, requiredSlots);
		if (missingSlots.length > 0) {
			return fail(400, {
				message: `First variant is missing slot values: ${missingSlots.join(", ")}`,
				values: raw,
			});
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
				slotValues,
				openingState: osValidation.data,
			});
		});

		return redirect(302, "/admin/templates");
	},
};
