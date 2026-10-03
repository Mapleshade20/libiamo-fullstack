import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { llmDataset, llmDatasetCase, llmRun, llmTrace } from "$lib/server/db/schema";
import { findRecipe } from "./recipes";

export class LabInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LabInputError";
	}
}

export async function listDatasets() {
	const datasets = await db.select().from(llmDataset).orderBy(desc(llmDataset.createdAt));
	const caseCounts = await db.select({ datasetId: llmDatasetCase.datasetId, value: count() }).from(llmDatasetCase).groupBy(llmDatasetCase.datasetId);
	const runCounts = await db.select({ datasetId: llmRun.datasetId, value: count() }).from(llmRun).groupBy(llmRun.datasetId);
	const cases = new Map(caseCounts.map((row) => [row.datasetId, row.value]));
	const runs = new Map(runCounts.map((row) => [row.datasetId, row.value]));
	return datasets.map((dataset) => ({ ...dataset, caseCount: cases.get(dataset.id) ?? 0, runCount: runs.get(dataset.id) ?? 0 }));
}

export async function createDataset(input: { name: string; description: string; recipeId: string; judgeRubric: string | null; createdBy: string }) {
	if (!findRecipe(input.recipeId)) throw new LabInputError("Unknown recipe.");
	const [created] = await db.insert(llmDataset).values(input).returning({ id: llmDataset.id });
	return created.id;
}

export async function updateDataset(id: number, input: { name: string; description: string; judgeRubric: string | null }) {
	await db.update(llmDataset).set(input).where(eq(llmDataset.id, id));
}

export async function deleteDataset(id: number) {
	// Runs cascade with the dataset, and their traces with the runs.
	await db.delete(llmDataset).where(eq(llmDataset.id, id));
}

export async function getDataset(id: number) {
	const dataset = await db.query.llmDataset.findFirst({ where: eq(llmDataset.id, id) });
	if (!dataset) return null;
	const cases = await db.select().from(llmDatasetCase).where(eq(llmDatasetCase.datasetId, id)).orderBy(asc(llmDatasetCase.id));
	const runs = await db.select().from(llmRun).where(eq(llmRun.datasetId, id)).orderBy(desc(llmRun.createdAt));
	return { ...dataset, cases, runs };
}

export async function addCaseFromTrace(input: { datasetId: number; traceId: string; label: string; createdBy: string }) {
	const dataset = await db.query.llmDataset.findFirst({ where: eq(llmDataset.id, input.datasetId), columns: { recipeId: true } });
	if (!dataset) throw new LabInputError("Dataset not found.");
	const trace = await db.query.llmTrace.findFirst({
		where: eq(llmTrace.id, input.traceId),
		columns: { recipeId: true, recipeVersion: true, input: true, userId: true, origin: true },
	});
	if (!trace) throw new LabInputError("Trace not found.");
	if (trace.recipeId !== dataset.recipeId) throw new LabInputError(`This dataset holds ${dataset.recipeId} cases, not ${trace.recipeId}.`);
	const [created] = await db
		.insert(llmDatasetCase)
		.values({
			datasetId: input.datasetId,
			recipeVersion: trace.recipeVersion,
			input: trace.input,
			label: input.label,
			sourceTraceId: input.traceId,
			// Lab traces belong to the staff member who ran them, not to a learner.
			sourceUserId: trace.origin === "lab" ? null : trace.userId,
			createdBy: input.createdBy,
		})
		.returning({ id: llmDatasetCase.id });
	return created.id;
}

export async function addCase(input: { datasetId: number; input: unknown; label: string; createdBy: string }) {
	const dataset = await db.query.llmDataset.findFirst({ where: eq(llmDataset.id, input.datasetId), columns: { recipeId: true } });
	const recipe = dataset ? findRecipe(dataset.recipeId) : null;
	if (!dataset || !recipe) throw new LabInputError("Dataset not found.");
	const [created] = await db
		.insert(llmDatasetCase)
		.values({ datasetId: input.datasetId, recipeVersion: recipe.version, input: input.input, label: input.label, createdBy: input.createdBy })
		.returning({ id: llmDatasetCase.id });
	return created.id;
}

export async function updateCase(id: number, input: { label: string; input?: unknown }) {
	await db
		.update(llmDatasetCase)
		.set({ label: input.label, ...(input.input === undefined ? {} : { input: input.input }) })
		.where(eq(llmDatasetCase.id, id));
}

export async function deleteCase(id: number) {
	await db.delete(llmDatasetCase).where(eq(llmDatasetCase.id, id));
}

export async function listDatasetsForRecipe(recipeId: string) {
	return db
		.select({ id: llmDataset.id, name: llmDataset.name })
		.from(llmDataset)
		.where(eq(llmDataset.recipeId, recipeId))
		.orderBy(asc(llmDataset.name));
}
