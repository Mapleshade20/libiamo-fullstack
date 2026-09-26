import { error, fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { requireAdmin } from "$lib/server/auth/authz";
import { addCaseFromTrace, createDataset, LabInputError, listDatasetsForRecipe } from "$lib/server/llm/lab/datasets";
import { describeRecipe, findRecipe } from "$lib/server/llm/lab/recipes";
import { deleteTraces, getTrace, rateTrace } from "$lib/server/llm/lab/traces";
import type { Actions, PageServerLoad } from "./$types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX_LENGTH = 2_000;

async function loadTrace(id: string) {
	if (!UUID.test(id)) error(404, "Trace not found");
	const trace = await getTrace(id);
	if (!trace) error(404, "Trace not found");
	return trace;
}

export const load: PageServerLoad = async (event) => {
	const viewer = requireAdmin(event);
	const trace = await loadTrace(event.params.id);
	const recipe = findRecipe(trace.recipeId);
	return {
		trace,
		recipe: recipe ? describeRecipe(recipe) : null,
		datasets: await listDatasetsForRecipe(trace.recipeId),
		myRating: trace.ratings.find((rating) => rating.userId === viewer.id) ?? null,
	};
};

export const actions: Actions = {
	rate: async (event) => {
		const viewer = requireAdmin(event);
		const trace = await loadTrace(event.params.id);
		const form = await event.request.formData();
		const vote = Number(form.get("vote"));
		const note = String(form.get("note") ?? "").trim();
		if (![-1, 0, 1].includes(vote) || note.length > NOTE_MAX_LENGTH)
			return fail(400, { rateError: "Choose a vote and keep the note under 2,000 characters." });
		await rateTrace({ traceId: trace.id, userId: viewer.id, vote: vote as -1 | 0 | 1, note });
		return { rated: true };
	},
	pin: async (event) => {
		const viewer = requireAdmin(event);
		const trace = await loadTrace(event.params.id);
		const form = await event.request.formData();
		const label = String(form.get("label") ?? "")
			.trim()
			.slice(0, 200);
		const newName = String(form.get("newDatasetName") ?? "")
			.trim()
			.slice(0, 120);
		const datasetId = Number(form.get("datasetId"));
		try {
			const targetId = newName
				? await createDataset({ name: newName, description: "", recipeId: trace.recipeId, judgeRubric: null, createdBy: viewer.id })
				: datasetId;
			if (!Number.isSafeInteger(targetId) || targetId <= 0) return fail(400, { pinError: "Choose a dataset or name a new one." });
			await addCaseFromTrace({ datasetId: targetId, traceId: trace.id, label, createdBy: viewer.id });
			return { pinnedTo: targetId };
		} catch (cause) {
			if (cause instanceof LabInputError) return fail(400, { pinError: cause.message });
			throw cause;
		}
	},
	delete: async (event) => {
		requireAdmin(event);
		const trace = await loadTrace(event.params.id);
		if (trace.runId !== null) return fail(400, { deleteError: "This trace belongs to a run; delete the run to remove it." });
		await deleteTraces({ ids: [trace.id] });
		redirect(303, `${base}/admin/lab/traces`);
	},
};
