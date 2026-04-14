import { fail, redirect } from "@sveltejs/kit";
import { templateSchema } from "$lib/schemas";
import { db } from "$lib/server/db";
import { template, templateVariant } from "$lib/server/db/schema";
import type { Actions } from "./$types";

function parseJson(raw: unknown): Record<string, unknown> {
	if (typeof raw !== "string" || raw.trim() === "") return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

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

		const slotValues = parseJson(formData.get("firstVariantSlotValues"));
		const openingState = parseJson(formData.get("firstVariantOpeningState"));

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
				openingState,
			});
		});

		return redirect(302, "/admin/templates");
	},
};
