import { fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { requireAdmin } from "$lib/server/auth/authz";
import { createDataset, LabInputError, listDatasets } from "$lib/server/llm/lab/datasets";
import { describeRecipes } from "$lib/server/llm/lab/recipes";
import type { Actions, PageServerLoad } from "./$types";

function fieldError(field: string, message: string): Record<string, string[]> {
	return { [field]: [message] };
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	return { datasets: await listDatasets(), recipes: describeRecipes().map(({ id, title }) => ({ id, title })) };
};

export const actions: Actions = {
	create: async (event) => {
		const viewer = requireAdmin(event);
		const form = await event.request.formData();
		const name = String(form.get("name") ?? "").trim();
		const recipeId = String(form.get("recipeId") ?? "");
		const description = String(form.get("description") ?? "").trim();
		const judgeRubric = String(form.get("judgeRubric") ?? "").trim();
		if (!name || name.length > 120) return fail(400, { errors: fieldError("name", "Name the dataset (up to 120 characters).") });
		let id: number;
		try {
			id = await createDataset({ name, recipeId, description, judgeRubric: judgeRubric || null, createdBy: viewer.id });
		} catch (cause) {
			if (cause instanceof LabInputError) return fail(400, { errors: fieldError("recipeId", cause.message) });
			throw cause;
		}
		redirect(303, `${base}/admin/lab/datasets/${id}`);
	},
};
