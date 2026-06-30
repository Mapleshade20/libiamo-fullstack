import { type ActionFailure, error, fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { parseVariantFormData, prepareVariantPayload } from "$lib/admin/template-actions";
import { buildTemplateImportPreview } from "$lib/admin/template-import-preview";
import { templateSchema } from "$lib/schemas";
import { checkTemplateDeletionSafety, checkTemplateVariantDeletionSafety } from "$lib/server/admin/template-deletion";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { template, templateVariant } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

type VariantStatusActionResult =
	| {
			templateId: number;
			variantId: number;
			variant: { isActive: boolean };
	  }
	| ActionFailure<{ action: string; message: string }>;

function isActionFailure(result: VariantStatusActionResult): result is ActionFailure<{ action: string; message: string }> {
	return "status" in result;
}

function failWithMessage(action: string, status: number, message: string) {
	return fail(status, { action, message });
}

async function hasMultipleActiveVariants(templateId: number) {
	const activeVariants = await db
		.select({ id: templateVariant.id })
		.from(templateVariant)
		.where(and(eq(templateVariant.templateId, templateId), eq(templateVariant.isActive, true)))
		.limit(2);
	return activeVariants.length > 1;
}

async function setTemplateActive(id: number, isActive: boolean, action: "activateTemplate" | "deactivateTemplate") {
	if (Number.isNaN(id)) return failWithMessage(action, 400, "Invalid template id");

	const [tpl] = await db.select({ isActive: template.isActive }).from(template).where(eq(template.id, id)).limit(1);
	if (!tpl) return failWithMessage(action, 404, "Template not found");
	if (tpl.isActive === isActive) return failWithMessage(action, 400, `Template is already ${isActive ? "active" : "inactive"}`);

	await db.update(template).set({ isActive }).where(eq(template.id, id));

	return isActive ? { activatedTemplate: true } : { deactivatedTemplate: true };
}

async function getVariantStatusForAction(
	event: {
		locals: App.Locals;
		params: { id: string };
		request: Request;
	},
	action: string,
): Promise<VariantStatusActionResult> {
	requireAdmin(event);

	const templateId = Number(event.params.id);
	const formData = await event.request.formData();
	const variantId = Number(formData.get("variantId"));
	if (Number.isNaN(variantId)) return failWithMessage(action, 400, "Invalid variant id");

	const [variant] = await db
		.select({ isActive: templateVariant.isActive })
		.from(templateVariant)
		.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, templateId)))
		.limit(1);
	if (!variant) return failWithMessage(action, 404, "Variant not found");

	return { templateId, variantId, variant };
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);

	const id = Number(event.params.id);
	if (Number.isNaN(id)) return error(404, "Template not found");

	const [tpl] = await db.select().from(template).where(eq(template.id, id)).limit(1);
	if (!tpl) return error(404, "Template not found");

	const variants = await db.select().from(templateVariant).where(eq(templateVariant.templateId, id)).orderBy(templateVariant.id);

	return { template: tpl, variants };
};

export const actions: Actions = {
	save: async (event) => {
		requireAdmin(event);

		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const raw = Object.fromEntries(formData);

		const result = templateSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { action: "save", errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		await db.update(template).set(result.data).where(eq(template.id, id));

		return { saved: true };
	},

	delete: async (event) => {
		requireAdmin(event);

		const id = Number(event.params.id);
		if (Number.isNaN(id)) return failWithMessage("delete", 400, "Invalid template id");

		const safety = await checkTemplateDeletionSafety(id);
		if (!safety.safe) return failWithMessage("delete", 400, safety.message);

		await db.transaction(async (tx) => {
			await tx.delete(templateVariant).where(eq(templateVariant.templateId, id));
			await tx.delete(template).where(eq(template.id, id));
		});

		return redirect(302, "/admin/templates");
	},

	activateTemplate: async (event) => {
		requireAdmin(event);
		return setTemplateActive(Number(event.params.id), true, "activateTemplate");
	},

	deactivateTemplate: async (event) => {
		requireAdmin(event);
		return setTemplateActive(Number(event.params.id), false, "deactivateTemplate");
	},

	importJson: async (event) => {
		requireAdmin(event);

		const id = Number(event.params.id);
		if (Number.isNaN(id)) return failWithMessage("importJson", 400, "Invalid template id");

		const formData = await event.request.formData();
		const rawJson = formData.get("templateJson");
		if (typeof rawJson !== "string" || rawJson.trim() === "") return failWithMessage("importJson", 400, "Paste template JSON before importing.");

		const existingVariants = await db
			.select({ id: templateVariant.id, slotValues: templateVariant.slotValues })
			.from(templateVariant)
			.where(eq(templateVariant.templateId, id))
			.orderBy(templateVariant.id);
		const preview = buildTemplateImportPreview(rawJson, existingVariants);
		if (!preview.ok) return failWithMessage("importJson", 400, preview.error);

		const { template: importedTemplate, variants } = preview.payload;
		const importedVariantIds = variants.map((variant) => variant.id).filter((variantId): variantId is number => typeof variantId === "number");
		const uniqueImportedVariantIds = new Set(importedVariantIds);

		await db.transaction(async (tx) => {
			await tx.update(template).set(importedTemplate).where(eq(template.id, id));

			for (const variant of variants) {
				const variantPayload = {
					isActive: variant.isActive,
					slotValues: variant.slotValues,
					openingState: variant.openingState,
				};

				if (variant.id !== undefined) {
					await tx
						.update(templateVariant)
						.set(variantPayload)
						.where(and(eq(templateVariant.id, variant.id), eq(templateVariant.templateId, id)));
				} else {
					await tx.insert(templateVariant).values({
						templateId: id,
						...variantPayload,
					});
				}
			}

			for (const existingVariant of existingVariants) {
				if (uniqueImportedVariantIds.has(existingVariant.id)) continue;
				await tx
					.update(templateVariant)
					.set({ isActive: false })
					.where(and(eq(templateVariant.id, existingVariant.id), eq(templateVariant.templateId, id)));
			}
		});

		return { imported: true };
	},

	addVariant: async (event) => {
		requireAdmin(event);

		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const { slotValues, openingState } = parseVariantFormData(formData);

		// Get template to know selected UI
		const [tpl] = await db.select().from(template).where(eq(template.id, id)).limit(1);
		if (!tpl) return failWithMessage("addVariant", 404, "Template not found");

		const variantResult = prepareVariantPayload(tpl, slotValues, openingState);
		if (variantResult.error) {
			return failWithMessage("addVariant", 400, variantResult.error);
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
		requireAdmin(event);

		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const variantId = Number(formData.get("variantId"));
		if (Number.isNaN(variantId)) return failWithMessage("saveVariant", 400, "Invalid variant id");

		const { slotValues, openingState } = parseVariantFormData(formData);

		// Get template to know selected UI
		const [tpl] = await db.select().from(template).where(eq(template.id, id)).limit(1);
		if (!tpl) return failWithMessage("saveVariant", 404, "Template not found");

		const variantResult = prepareVariantPayload(tpl, slotValues, openingState);
		if (variantResult.error) {
			return failWithMessage("saveVariant", 400, variantResult.error);
		}

		const [variant] = await db
			.select({ id: templateVariant.id })
			.from(templateVariant)
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, id)))
			.limit(1);
		if (!variant) return failWithMessage("saveVariant", 404, "Variant not found");

		await db
			.update(templateVariant)
			.set({ slotValues: variantResult.slotValues, openingState: variantResult.openingState })
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, id)));

		return { savedVariant: true };
	},

	deleteVariant: async (event) => {
		const result = await getVariantStatusForAction(event, "deleteVariant");
		if (isActionFailure(result)) return result;
		const { templateId, variantId } = result;

		const safety = await checkTemplateVariantDeletionSafety(variantId);
		if (!safety.safe) return failWithMessage("deleteVariant", 400, safety.message);

		if (result.variant.isActive && !(await hasMultipleActiveVariants(templateId))) {
			return failWithMessage("deleteVariant", 400, "Cannot delete the last active variant. Add another variant first or delete the template.");
		}

		await db.delete(templateVariant).where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, templateId)));

		return { deletedVariant: true };
	},

	activateVariant: async (event) => {
		const result = await getVariantStatusForAction(event, "activateVariant");
		if (isActionFailure(result)) return result;
		const { templateId, variantId, variant } = result;
		if (variant.isActive) return failWithMessage("activateVariant", 400, "Variant is already active");

		await db
			.update(templateVariant)
			.set({ isActive: true })
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, templateId)));

		return { activated: true };
	},

	deactivateVariant: async (event) => {
		const result = await getVariantStatusForAction(event, "deactivateVariant");
		if (isActionFailure(result)) return result;
		const { templateId, variantId, variant } = result;
		if (!variant.isActive) return failWithMessage("deactivateVariant", 400, "Variant is already inactive");

		// Enforce at-least-one-active-variant rule
		if (!(await hasMultipleActiveVariants(templateId))) {
			return failWithMessage("deactivateVariant", 400, "Cannot deactivate the last active variant. Add another variant first.");
		}

		await db
			.update(templateVariant)
			.set({ isActive: false })
			.where(and(eq(templateVariant.id, variantId), eq(templateVariant.templateId, templateId)));

		return { deactivated: true };
	},
};
