import { fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { REASONING_EFFORTS, type ReasoningEffort } from "$lib/constants";
import type { ProviderRef } from "$lib/llm/lab";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { llmDataset, llmDatasetCase } from "$lib/server/db/schema";
import { LabInputError } from "$lib/server/llm/lab/datasets";
import { previewMessages, runPlayground } from "$lib/server/llm/lab/playground";
import { describeRecipes } from "$lib/server/llm/lab/recipes";
import { getTrace, listTraces } from "$lib/server/llm/lab/traces";
import { isProviderRef, listProviderOptions, ProviderUnavailableError } from "$lib/server/llm/providers";
import type { Actions, PageServerLoad } from "./$types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAYLOAD = 2_000_000;

const PayloadSchema = z.object({
	recipeId: z.string().min(1),
	input: z.string().max(MAX_PAYLOAD),
	slots: z.record(z.string(), z.string().max(100_000)),
	providerRef: z.string().refine(isProviderRef),
	temperature: z.number().min(0).max(2).nullable(),
	reasoningEffort: z.enum(REASONING_EFFORTS).nullable(),
	messages: z
		.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(MAX_PAYLOAD) }).strict())
		.min(1)
		.max(40)
		.nullable(),
});

type Source = {
	recipeId: string;
	input: unknown;
	slots: Record<string, string>;
	temperature: number | null;
	reasoningEffort: ReasoningEffort | null;
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }> | null;
	label: string;
	trace: Awaited<ReturnType<typeof getTrace>>;
};

async function loadSource(url: URL): Promise<Source | null> {
	const traceId = url.searchParams.get("trace");
	if (traceId && UUID.test(traceId)) {
		const trace = await getTrace(traceId);
		if (trace)
			return {
				recipeId: trace.recipeId,
				input: trace.input,
				slots: trace.variant?.slots ?? {},
				temperature: trace.variant?.options?.temperature ?? null,
				reasoningEffort: trace.variant?.options?.reasoningEffort ?? null,
				messages: trace.variant?.messagesEdited ? trace.messages : null,
				label: `trace from ${trace.createdAt.toISOString()}`,
				trace,
			};
	}
	const caseId = Number(url.searchParams.get("case"));
	if (Number.isSafeInteger(caseId) && caseId > 0) {
		const [row] = await db
			.select({ input: llmDatasetCase.input, label: llmDatasetCase.label, recipeId: llmDataset.recipeId, dataset: llmDataset.name })
			.from(llmDatasetCase)
			.innerJoin(llmDataset, eq(llmDataset.id, llmDatasetCase.datasetId))
			.where(eq(llmDatasetCase.id, caseId))
			.limit(1);
		if (row)
			return {
				recipeId: row.recipeId,
				input: row.input,
				slots: {},
				temperature: null,
				reasoningEffort: null,
				messages: null,
				label: `${row.dataset} · ${row.label || `case ${caseId}`}`,
				trace: null,
			};
	}
	return null;
}

function parsePayload(form: FormData) {
	const raw = form.get("payload");
	if (typeof raw !== "string" || raw.length > MAX_PAYLOAD * 2) return null;
	try {
		const result = PayloadSchema.safeParse(JSON.parse(raw));
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

function parseInput(text: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return { ok: false };
	}
}

export const load: PageServerLoad = async (event) => {
	const viewer = requireAdmin(event);
	const source = await loadSource(event.url);
	const recipes = describeRecipes();
	const requested = event.url.searchParams.get("recipe");
	return {
		recipes,
		providers: await listProviderOptions(viewer.id),
		// Opened without a source: offer recent real calls to start from.
		recentCalls: source
			? []
			: (await listTraces({ origin: "app", limit: 8 })).map(({ id, recipeId, createdAt, userName, taskId, status }) => ({
					id,
					recipeId,
					createdAt,
					userName,
					taskId,
					status,
				})),
		source: source
			? {
					...source,
					trace: source.trace
						? {
								id: source.trace.id,
								output: source.trace.output,
								outputText: source.trace.outputText,
								error: source.trace.error,
								route: source.trace.route,
							}
						: null,
				}
			: null,
		initialRecipeId: source?.recipeId ?? recipes.find((recipe) => recipe.id === requested)?.id ?? recipes[0].id,
	};
};

export const actions: Actions = {
	preview: async (event) => {
		requireAdmin(event);
		const payload = parsePayload(await event.request.formData());
		if (!payload) return fail(400, { error: "The request could not be read." });
		const input = parseInput(payload.input);
		if (!input.ok) return fail(400, { error: "The input is not valid JSON.", field: "input" });
		try {
			return { preview: previewMessages(payload.recipeId, input.value, payload.slots) };
		} catch (cause) {
			if (cause instanceof LabInputError) return fail(400, { error: cause.message });
			throw cause;
		}
	},
	run: async (event) => {
		const viewer = requireAdmin(event);
		const payload = parsePayload(await event.request.formData());
		if (!payload) return fail(400, { error: "The request could not be read." });
		const input = parseInput(payload.input);
		if (!input.ok) return fail(400, { error: "The input is not valid JSON.", field: "input" });
		try {
			const traceId = await runPlayground(
				{
					recipeId: payload.recipeId,
					input: input.value,
					slots: payload.slots,
					providerRef: payload.providerRef as ProviderRef,
					temperature: payload.temperature,
					reasoningEffort: payload.reasoningEffort,
					messages: payload.messages,
				},
				viewer.id,
			);
			return { result: await getTrace(traceId) };
		} catch (cause) {
			if (cause instanceof LabInputError || cause instanceof ProviderUnavailableError) return fail(400, { error: cause.message });
			throw cause;
		}
	},
};
