import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { parseVariantFormData, prepareVariantPayload } from "$lib/admin/template-actions";
import { templateSchema } from "$lib/schemas";
import { db } from "$lib/server/db";
import { template, templateVariant } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const id = Number(event.params.id);
	if (Number.isNaN(id)) return error(404, "Template not found");

	const [tpl] = await db.select().from(template).where(eq(template.id, id)).limit(1);
	if (!tpl) return error(404, "Template not found");

	const variants = await db.select().from(templateVariant).where(eq(templateVariant.templateId, id)).orderBy(templateVariant.id);

	return { template: tpl, variants };
};

export const actions: Actions = {
	save: async (event) => {
		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const raw = Object.fromEntries(formData);

		const result = templateSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		await db.update(template).set(result.data).where(eq(template.id, id));

		return { saved: true };
	},

	delete: async (event) => {
		const id = Number(event.params.id);
		await db.update(template).set({ isActive: false }).where(eq(template.id, id));
		return redirect(302, "/admin/templates");
	},

	addVariant: async (event) => {
		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const { slotValues, openingState } = parseVariantFormData(formData);

		// Get template to know selected UI
		const [tpl] = await db.select().from(template).where(eq(template.id, id)).limit(1);
		if (!tpl) return fail(404, { message: "Template not found" });

		const variantResult = prepareVariantPayload(tpl, slotValues, openingState);
		if (variantResult.error) {
			return fail(400, { message: variantResult.error });
		}

		await db.insert(templateVariant).values({
			templateId: id,
			isActive: true,
			slotValues: variantResult.slotValues,
			openingState: variantResult.openingState,
		});

		return { addedVariant: true };
	},

	saveVariant: async (event) => {
		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const variantId = Number(formData.get("variantId"));
		if (Number.isNaN(variantId)) return fail(400, { message: "Invalid variant id" });

		const { slotValues, openingState } = parseVariantFormData(formData);

		// Get template to know selected UI
		const [tpl] = await db.select().from(template).where(eq(template.id, id)).limit(1);
		if (!tpl) return fail(404, { message: "Template not found" });

		const variantResult = prepareVariantPayload(tpl, slotValues, openingState);
		if (variantResult.error) {
			return fail(400, { message: variantResult.error });
		}

		const [variant] = await db
			.select({ id: templateVariant.id })
			.from(templateVariant)
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, id)))
			.limit(1);
		if (!variant) return fail(404, { message: "Variant not found" });

		await db
			.update(templateVariant)
			.set({ slotValues: variantResult.slotValues, openingState: variantResult.openingState })
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, id)));

		return { savedVariant: true };
	},

	activateVariant: async (event) => {
		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const variantId = Number(formData.get("variantId"));
		if (Number.isNaN(variantId)) return fail(400, { message: "Invalid variant id" });

		const [variant] = await db
			.select({ isActive: templateVariant.isActive })
			.from(templateVariant)
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, id)))
			.limit(1);
		if (!variant) return fail(404, { message: "Variant not found" });
		if (variant.isActive) return fail(400, { message: "Variant is already active" });

		await db
			.update(templateVariant)
			.set({ isActive: true })
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, id)));

		return { activated: true };
	},

	deactivateVariant: async (event) => {
		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const variantId = Number(formData.get("variantId"));
		if (Number.isNaN(variantId)) return fail(400, { message: "Invalid variant id" });

		const [variant] = await db
			.select({ isActive: templateVariant.isActive })
			.from(templateVariant)
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, id)))
			.limit(1);
		if (!variant) return fail(404, { message: "Variant not found" });
		if (!variant.isActive) return fail(400, { message: "Variant is already inactive" });

		// Enforce at-least-one-active-variant rule
		const activeVariants = await db
			.select({ count: templateVariant.id })
			.from(templateVariant)
			.where(and(eq(templateVariant.templateId, id), eq(templateVariant.isActive, true)));

		if (activeVariants.length <= 1) {
			return fail(400, { message: "Cannot deactivate the last active variant. Add another variant first." });
		}

		await db
			.update(templateVariant)
			.set({ isActive: false })
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, id)));

		return { deactivated: true };
	},
};
