import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { templateSchema } from "$lib/schemas";
import { db } from "$lib/server/db";
import { template, templateVariant } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

function parseJson(raw: unknown): Record<string, unknown> {
	if (typeof raw !== "string" || raw.trim() === "") return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

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
			return fail(400, { errors: result.error.flatten().fieldErrors, values: raw });
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
		const slotValues = parseJson(formData.get("slotValues"));
		const openingState = parseJson(formData.get("openingState"));

		await db.insert(templateVariant).values({
			templateId: id,
			isActive: true,
			slotValues,
			openingState,
		});

		return { addedVariant: true };
	},

	saveVariant: async (event) => {
		const formData = await event.request.formData();
		const variantId = Number(formData.get("variantId"));
		if (Number.isNaN(variantId)) return fail(400, { message: "Invalid variant id" });

		const slotValues = parseJson(formData.get("slotValues"));
		const openingState = parseJson(formData.get("openingState"));

		await db.update(templateVariant).set({ slotValues, openingState }).where(eq(templateVariant.id, variantId));

		return { savedVariant: true };
	},

	deactivateVariant: async (event) => {
		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const variantId = Number(formData.get("variantId"));
		if (Number.isNaN(variantId)) return fail(400, { message: "Invalid variant id" });

		// Enforce at-least-one-active-variant rule
		const activeVariants = await db
			.select({ count: templateVariant.id })
			.from(templateVariant)
			.where(and(eq(templateVariant.templateId, id), eq(templateVariant.isActive, true)));

		if (activeVariants.length <= 1) {
			return fail(400, { message: "Cannot deactivate the last active variant. Add another variant first." });
		}

		await db.update(templateVariant).set({ isActive: false }).where(eq(templateVariant.id, variantId));

		return { deactivated: true };
	},
};
