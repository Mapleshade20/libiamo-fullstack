import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { REASONING_EFFORTS } from "$lib/constants";
import type { ProviderRef } from "$lib/llm/lab";
import { requireAdmin } from "$lib/server/auth/authz";
import { LabInputError } from "$lib/server/llm/lab/datasets";
import { deleteOverride, listOverrides, saveOverride } from "$lib/server/llm/lab/overrides";
import { describeRecipes } from "$lib/server/llm/lab/recipes";
import { isProviderRef, listProviderOptions } from "$lib/server/llm/providers";
import type { Actions, PageServerLoad } from "./$types";

const OverrideSchema = z.object({
	recipeId: z.string().min(1),
	enabled: z.boolean(),
	slots: z.record(z.string(), z.string().max(100_000)),
	providerRef: z.string().refine(isProviderRef).nullable(),
	temperature: z.number().min(0).max(2).nullable(),
	reasoningEffort: z.enum(REASONING_EFFORTS).nullable(),
	note: z.string().max(500),
});

export const load: PageServerLoad = async (event) => {
	const viewer = requireAdmin(event);
	return { overrides: await listOverrides(viewer.id), recipes: describeRecipes(), providers: await listProviderOptions(viewer.id) };
};

export const actions: Actions = {
	save: async (event) => {
		const viewer = requireAdmin(event);
		let payload: z.infer<typeof OverrideSchema>;
		try {
			const result = OverrideSchema.safeParse(JSON.parse(String((await event.request.formData()).get("payload"))));
			if (!result.success) return fail(400, { error: "The override could not be read." });
			payload = result.data;
		} catch {
			return fail(400, { error: "The override could not be read." });
		}
		try {
			await saveOverride({ ...payload, providerRef: payload.providerRef as ProviderRef | null, userId: viewer.id });
		} catch (cause) {
			if (cause instanceof LabInputError) return fail(400, { error: cause.message, recipeId: payload.recipeId });
			throw cause;
		}
		return { saved: payload.recipeId };
	},
	delete: async (event) => {
		const viewer = requireAdmin(event);
		const recipeId = String((await event.request.formData()).get("recipeId") ?? "");
		await deleteOverride(viewer.id, recipeId);
		return { deleted: recipeId };
	},
};
