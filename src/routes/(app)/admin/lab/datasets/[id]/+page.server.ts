import { error, fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { base } from "$app/paths";
import { REASONING_EFFORTS } from "$lib/constants";
import type { ProviderRef } from "$lib/llm/lab";
import { requireAdmin } from "$lib/server/auth/authz";
import { wakeLlmLabWorker } from "$lib/server/llm/lab/boot";
import { addCase, deleteCase, deleteDataset, getDataset, LabInputError, updateCase, updateDataset } from "$lib/server/llm/lab/datasets";
import { describeRecipe, findRecipe } from "$lib/server/llm/lab/recipes";
import { createRun } from "$lib/server/llm/lab/runs";
import { isProviderRef, listProviderOptions } from "$lib/server/llm/providers";
import type { Actions, PageServerLoad } from "./$types";

function fieldError(field: string, message: string): Record<string, string[]> {
	return { [field]: [message] };
}

const MAX_INPUT = 2_000_000;

const ProviderRefSchema = z.string().refine(isProviderRef, "Unknown provider.") as unknown as z.ZodType<ProviderRef>;
const RunPayloadSchema = z.object({
	label: z.string().trim().max(120),
	repeats: z.number().int().min(1).max(5),
	variants: z
		.array(
			z.object({
				key: z.string().regex(/^[a-z0-9-]{1,24}$/),
				label: z.string().trim().min(1).max(80),
				slots: z.record(z.string(), z.string().max(100_000)),
				providerRef: ProviderRefSchema,
				temperature: z.number().min(0).max(2).nullable(),
				reasoningEffort: z.enum(REASONING_EFFORTS).nullable(),
			}),
		)
		.min(1)
		.max(6),
	judge: z.object({ rubric: z.string().trim().min(1).max(8_000), providerRef: ProviderRefSchema }).nullable(),
});

function datasetId(params: { id: string }): number {
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id <= 0) error(404, "Dataset not found");
	return id;
}

export const load: PageServerLoad = async (event) => {
	const viewer = requireAdmin(event);
	const dataset = await getDataset(datasetId(event.params));
	if (!dataset) error(404, "Dataset not found");
	const recipe = findRecipe(dataset.recipeId);
	return { dataset, recipe: recipe ? describeRecipe(recipe) : null, providers: await listProviderOptions(viewer.id) };
};

function caseId(form: FormData): number | null {
	const id = Number(form.get("caseId"));
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const actions: Actions = {
	update: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		const name = String(form.get("name") ?? "").trim();
		if (!name || name.length > 120) return fail(400, { errors: fieldError("name", "Name the dataset (up to 120 characters).") });
		const judgeRubric = String(form.get("judgeRubric") ?? "").trim();
		await updateDataset(datasetId(event.params), {
			name,
			description: String(form.get("description") ?? "").trim(),
			judgeRubric: judgeRubric || null,
		});
		return { updated: true };
	},
	addCase: async (event) => {
		const viewer = requireAdmin(event);
		const form = await event.request.formData();
		const raw = String(form.get("input") ?? "");
		let input: unknown;
		try {
			if (raw.length > MAX_INPUT) throw new Error("too long");
			input = JSON.parse(raw);
		} catch {
			return fail(400, { errors: fieldError("input", "Enter the recipe input as valid JSON.") });
		}
		try {
			await addCase({
				datasetId: datasetId(event.params),
				input,
				label: String(form.get("label") ?? "")
					.trim()
					.slice(0, 200),
				createdBy: viewer.id,
			});
		} catch (cause) {
			if (cause instanceof LabInputError) return fail(400, { errors: fieldError("input", cause.message) });
			throw cause;
		}
		return { caseAdded: true };
	},
	updateCase: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		const id = caseId(form);
		if (id)
			await updateCase(id, {
				label: String(form.get("label") ?? "")
					.trim()
					.slice(0, 200),
			});
		return { caseUpdated: true };
	},
	deleteCase: async (event) => {
		requireAdmin(event);
		const id = caseId(await event.request.formData());
		if (id) await deleteCase(id);
		return { caseDeleted: true };
	},
	createRun: async (event) => {
		const viewer = requireAdmin(event);
		const raw = (await event.request.formData()).get("payload");
		let payload: z.infer<typeof RunPayloadSchema>;
		try {
			const result = RunPayloadSchema.safeParse(JSON.parse(String(raw)));
			if (!result.success) return fail(400, { runError: result.error.issues[0]?.message ?? "The run could not be read." });
			payload = result.data;
		} catch {
			return fail(400, { runError: "The run could not be read." });
		}
		let runId: number;
		try {
			runId = await createRun({ datasetId: datasetId(event.params), ...payload, createdBy: viewer.id });
		} catch (cause) {
			if (cause instanceof LabInputError) return fail(400, { runError: cause.message });
			throw cause;
		}
		wakeLlmLabWorker();
		redirect(303, `${base}/admin/lab/runs/${runId}`);
	},
	delete: async (event) => {
		requireAdmin(event);
		await deleteDataset(datasetId(event.params));
		redirect(303, `${base}/admin/lab/datasets`);
	},
};
