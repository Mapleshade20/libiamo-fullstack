import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { LabCellSummary, LabRunJudge, LabVariantSpec } from "$lib/llm/lab";
import { isRetryableCell, summarizeRun } from "$lib/llm/lab";
import { db } from "$lib/server/db";
import { llmDataset, llmDatasetCase, llmRating, llmRun, llmRunCell, llmTrace } from "$lib/server/db/schema";
import { isProviderRef } from "../providers";
import { LabInputError } from "./datasets";
import { judgeLabOutput, runLabCall } from "./execute";
import { findRecipe } from "./recipes";
import { effectiveSlotOverrides, expandRunCells, MAX_RUN_CELLS, resolveVariant, slotOverrideProblems } from "./variants";

export type CreateRunInput = {
	datasetId: number;
	label: string;
	variants: LabVariantSpec[];
	repeats: number;
	judge: LabRunJudge | null;
	createdBy: string;
};

export async function createRun(input: CreateRunInput): Promise<number> {
	const dataset = await db.query.llmDataset.findFirst({ where: eq(llmDataset.id, input.datasetId) });
	const recipe = dataset ? findRecipe(dataset.recipeId) : null;
	if (!dataset || !recipe) throw new LabInputError("Dataset not found.");
	if (input.variants.length === 0) throw new LabInputError("Add at least one variant.");
	if (new Set(input.variants.map((variant) => variant.key)).size !== input.variants.length) throw new LabInputError("Variant keys must be unique.");
	const variants = input.variants.map((variant) => ({ ...variant, slots: effectiveSlotOverrides(recipe, variant.slots) }));
	for (const variant of variants) {
		if (!isProviderRef(variant.providerRef)) throw new LabInputError(`${variant.label}: unknown provider.`);
		const problems = slotOverrideProblems(recipe, variant.slots);
		if (problems.length) throw new LabInputError(`${variant.label}: ${problems.join(" ")}`);
	}
	if (input.judge && (!input.judge.rubric.trim() || !isProviderRef(input.judge.providerRef)))
		throw new LabInputError("The judge needs a rubric and a provider.");
	const cases = await db
		.select({ id: llmDatasetCase.id })
		.from(llmDatasetCase)
		.where(eq(llmDatasetCase.datasetId, input.datasetId))
		.orderBy(asc(llmDatasetCase.id));
	if (cases.length === 0) throw new LabInputError("The dataset has no cases.");
	const cells = expandRunCells(
		cases.map((row) => row.id),
		variants,
		input.repeats,
	);
	if (cells.length > MAX_RUN_CELLS) throw new LabInputError(`A run is limited to ${MAX_RUN_CELLS} calls; this one needs ${cells.length}.`);

	return db.transaction(async (transaction) => {
		const [run] = await transaction
			.insert(llmRun)
			.values({ datasetId: input.datasetId, label: input.label, variants, repeats: input.repeats, judge: input.judge, createdBy: input.createdBy })
			.returning({ id: llmRun.id });
		await transaction.insert(llmRunCell).values(cells.map((cell) => ({ ...cell, runId: run.id })));
		return run.id;
	});
}

export async function getRun(id: number, viewerId: string) {
	const run = await db.query.llmRun.findFirst({ where: eq(llmRun.id, id) });
	if (!run) return null;
	const dataset = await db.query.llmDataset.findFirst({ where: eq(llmDataset.id, run.datasetId) });
	if (!dataset) return null;
	const cases = await db.select().from(llmDatasetCase).where(eq(llmDatasetCase.datasetId, run.datasetId)).orderBy(asc(llmDatasetCase.id));
	const cells = await db
		.select({
			id: llmRunCell.id,
			caseId: llmRunCell.caseId,
			variantKey: llmRunCell.variantKey,
			repeatIndex: llmRunCell.repeatIndex,
			status: llmRunCell.status,
			error: llmRunCell.error,
			judge: llmRunCell.judge,
			traceId: llmRunCell.traceId,
			traceStatus: llmTrace.status,
			output: llmTrace.output,
			outputText: llmTrace.outputText,
			traceError: llmTrace.error,
			latencyMs: llmTrace.latencyMs,
			completionTokens: llmTrace.completionTokens,
			repaired: sql<boolean>`coalesce(jsonb_array_length(${llmTrace.attempts}) > 1, false)`,
		})
		.from(llmRunCell)
		.leftJoin(llmTrace, eq(llmTrace.id, llmRunCell.traceId))
		.where(eq(llmRunCell.runId, id))
		.orderBy(asc(llmRunCell.caseId), asc(llmRunCell.repeatIndex));
	const traceIds = cells.flatMap((cell) => (cell.traceId ? [cell.traceId] : []));
	const ratings = traceIds.length
		? await db
				.select({ traceId: llmRating.traceId, userId: llmRating.userId, vote: llmRating.vote, note: llmRating.note })
				.from(llmRating)
				.where(inArray(llmRating.traceId, traceIds))
		: [];
	const cellsWithRatings = cells.map((cell) => {
		const own = ratings.filter((rating) => rating.traceId === cell.traceId);
		return {
			...cell,
			votes: own.map((rating) => rating.vote),
			notes: own.filter((rating) => rating.note.trim()).map((rating) => rating.note),
			myRating: own.find((rating) => rating.userId === viewerId) ?? null,
		};
	});
	const summaries: LabCellSummary[] = cellsWithRatings.map((cell) => ({
		variantKey: cell.variantKey,
		status: cell.status,
		traceStatus: cell.traceStatus,
		repaired: cell.repaired,
		latencyMs: cell.latencyMs,
		completionTokens: cell.completionTokens,
		judge: cell.judge,
		votes: cell.votes,
	}));
	return {
		run,
		dataset,
		cases,
		cells: cellsWithRatings,
		stats: summarizeRun(
			run.variants.map((variant) => variant.key),
			summaries,
		),
	};
}

export async function cancelRun(id: number) {
	await db.transaction(async (transaction) => {
		await transaction.update(llmRun).set({ cancelledAt: new Date() }).where(eq(llmRun.id, id));
		await transaction
			.update(llmRunCell)
			.set({ status: "cancelled", leaseUntil: null, claimToken: null })
			.where(and(eq(llmRunCell.runId, id), inArray(llmRunCell.status, ["pending", "running"])));
	});
}

/** Re-queues every retryable cell (see `isRetryableCell`), discarding the outputs it replaces. */
export async function retryFailedCells(id: number): Promise<number> {
	const cells = await db
		.select({ id: llmRunCell.id, status: llmRunCell.status, traceId: llmRunCell.traceId, judge: llmRunCell.judge, traceStatus: llmTrace.status })
		.from(llmRunCell)
		.leftJoin(llmTrace, eq(llmTrace.id, llmRunCell.traceId))
		.where(eq(llmRunCell.runId, id));
	const retryable = cells.filter(isRetryableCell);
	if (retryable.length === 0) return 0;
	const replacedTraces = retryable.flatMap((cell) => [...(cell.traceId ? [cell.traceId] : []), ...(cell.judge?.traceId ? [cell.judge.traceId] : [])]);
	await db.transaction(async (transaction) => {
		await transaction.update(llmRun).set({ cancelledAt: null }).where(eq(llmRun.id, id));
		if (replacedTraces.length) await transaction.delete(llmTrace).where(inArray(llmTrace.id, replacedTraces));
		// A still-running claim is never touched: its token stays the only one that may write.
		await transaction
			.update(llmRunCell)
			.set({ status: "pending", attempts: 0, error: null, leaseUntil: null, claimToken: null, traceId: null, judge: null, completedAt: null })
			.where(
				and(
					inArray(
						llmRunCell.id,
						retryable.map((cell) => cell.id),
					),
					inArray(llmRunCell.status, ["failed", "cancelled", "done"]),
				),
			);
	});
	return retryable.length;
}

/** Deletes a run; its cells and every trace it produced (outputs and judge calls) cascade with it. */
export async function deleteRun(id: number) {
	await db.delete(llmRun).where(eq(llmRun.id, id));
}

export type ClaimedCell = { id: number; claimToken: string };

/** Runs one claimed cell to completion. Returns false when the claim was lost (cancelled or re-claimed). */
export async function processCell(cell: ClaimedCell): Promise<boolean> {
	const row = await db.query.llmRunCell.findFirst({ where: eq(llmRunCell.id, cell.id), with: { run: true, case: true } });
	if (!row) return false;
	const fence = and(eq(llmRunCell.id, cell.id), eq(llmRunCell.status, "running"), eq(llmRunCell.claimToken, cell.claimToken));
	const fail = async (message: string) => {
		await db.update(llmRunCell).set({ status: "failed", error: message, leaseUntil: null, claimToken: null, completedAt: new Date() }).where(fence);
		return true;
	};
	const dataset = await db.query.llmDataset.findFirst({ where: eq(llmDataset.id, row.run.datasetId), columns: { recipeId: true } });
	const recipe = dataset ? findRecipe(dataset.recipeId) : null;
	const spec = row.run.variants.find((variant) => variant.key === row.variantKey);
	const actorId = row.run.createdBy;
	if (!recipe || !spec || !actorId) return fail("The run's recipe, variant or owner no longer exists.");

	let result: Awaited<ReturnType<typeof runLabCall>>;
	try {
		const variant = await resolveVariant(spec, actorId);
		result = await runLabCall(recipe, row.case.input, variant, actorId, { label: spec.label, runId: row.runId });
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error));
	}
	const judge =
		row.run.judge && !result.record.error
			? await judgeLabOutput({ judge: row.run.judge, recipe, record: result.record, actorId, runId: row.runId })
			: null;
	const [updated] = await db
		.update(llmRunCell)
		.set({ status: "done", traceId: result.traceId, judge, error: null, leaseUntil: null, claimToken: null, completedAt: new Date() })
		.where(fence)
		.returning({ id: llmRunCell.id });
	if (!updated) {
		// Cancelled or re-claimed meanwhile: drop the orphaned outputs.
		const orphaned = [result.traceId, ...(judge?.traceId ? [judge.traceId] : [])];
		await db.delete(llmTrace).where(inArray(llmTrace.id, orphaned));
		return false;
	}
	return true;
}
