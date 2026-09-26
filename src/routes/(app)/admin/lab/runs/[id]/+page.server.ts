import { error, fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { LLM_LAB_RUN_DEPENDENCY } from "$lib/app/load-dependencies";
import { requireAdmin } from "$lib/server/auth/authz";
import { wakeLlmLabWorker } from "$lib/server/llm/lab/boot";
import { describeRecipe, findRecipe } from "$lib/server/llm/lab/recipes";
import { cancelRun, deleteRun, getRun, retryFailedCells } from "$lib/server/llm/lab/runs";
import { rateTrace } from "$lib/server/llm/lab/traces";
import type { Actions, PageServerLoad } from "./$types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function runId(params: { id: string }): number {
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id <= 0) error(404, "Run not found");
	return id;
}

export const load: PageServerLoad = async (event) => {
	const viewer = requireAdmin(event);
	event.depends(LLM_LAB_RUN_DEPENDENCY);
	const run = await getRun(runId(event.params), viewer.id);
	if (!run) error(404, "Run not found");
	const recipe = findRecipe(run.dataset.recipeId);
	return { ...run, recipe: recipe ? describeRecipe(recipe) : null };
};

export const actions: Actions = {
	rate: async (event) => {
		const viewer = requireAdmin(event);
		const form = await event.request.formData();
		const traceId = String(form.get("traceId") ?? "");
		const vote = Number(form.get("vote"));
		const note = String(form.get("note") ?? "").trim();
		if (!UUID.test(traceId) || ![-1, 0, 1].includes(vote) || note.length > 2_000) return fail(400, { error: "The rating could not be saved." });
		await rateTrace({ traceId, userId: viewer.id, vote: vote as -1 | 0 | 1, note });
		return { rated: traceId };
	},
	cancel: async (event) => {
		requireAdmin(event);
		await cancelRun(runId(event.params));
		return { cancelled: true };
	},
	retry: async (event) => {
		requireAdmin(event);
		await retryFailedCells(runId(event.params));
		wakeLlmLabWorker();
		return { retried: true };
	},
	delete: async (event) => {
		requireAdmin(event);
		const id = runId(event.params);
		const run = await getRun(id, "");
		await deleteRun(id);
		redirect(303, run ? `${base}/admin/lab/datasets/${run.dataset.id}` : `${base}/admin/lab/datasets`);
	},
};
