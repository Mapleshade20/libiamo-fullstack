/** Shared LLM Lab vocabulary: stored trace shapes, run specifications and per-variant statistics. */

import type { ReasoningEffort } from "$lib/constants";

export type LabChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LabChatOptions = { temperature?: number; maxTokens?: number; reasoningEffort?: ReasoningEffort };

export type TraceOrigin = "app" | "override" | "lab";

/** How a traced call deviated from its recipe's defaults. Never contains credentials. */
export type TraceVariant = {
	label?: string;
	slots?: Record<string, string>;
	providerId?: string;
	options?: LabChatOptions;
	messagesEdited?: boolean;
};

export type TraceAttempt = {
	stage: "initial" | "repair";
	requestMessages: LabChatMessage[];
	content: string | null;
	finishReason: string | null;
	usage?: unknown;
	errors: string[];
};

export type TraceError = { name: string; message: string; stage: "build" | "provider" | "parse" | "finalize" };

/**
 * `default` is the environment provider, `byok` the acting staff member's own key, and
 * `lab:<id>` an entry of `LLM_LAB_PROVIDERS`.
 */
export type ProviderRef = "default" | "byok" | `lab:${string}`;

export type LabProviderOption = { ref: ProviderRef; label: string; model: string };

/** One column of a run: a named deviation from the recipe defaults. */
export type LabVariantSpec = {
	key: string;
	label: string;
	slots: Record<string, string>;
	providerRef: ProviderRef;
	temperature: number | null;
	/** Null keeps the recipe's own effort. Absent in runs created before efforts existed. */
	reasoningEffort?: ReasoningEffort | null;
};

export type LabRunJudge = { rubric: string; providerRef: ProviderRef };

export type LabJudgeResult = { score: number; rationale: string; traceId?: string } | { error: string; traceId?: string };

export type LabCellStatus = "pending" | "running" | "done" | "failed" | "cancelled";

/**
 * Cells a retry re-runs: those that could not run, were cancelled, or whose model call failed
 * (provider, parse or validation errors are stored as results but are worth another attempt).
 */
export function isRetryableCell(cell: { status: LabCellStatus; traceStatus: "ok" | "error" | null }): boolean {
	return cell.status === "failed" || cell.status === "cancelled" || (cell.status === "done" && cell.traceStatus === "error");
}

export type LabCellSummary = {
	variantKey: string;
	status: LabCellStatus;
	traceStatus: "ok" | "error" | null;
	repaired: boolean;
	latencyMs: number | null;
	completionTokens: number | null;
	judge: LabJudgeResult | null;
	votes: number[];
};

export type LabVariantStats = {
	variantKey: string;
	total: number;
	finished: number;
	ok: number;
	failed: number;
	repaired: number;
	meanLatencyMs: number | null;
	meanCompletionTokens: number | null;
	meanJudgeScore: number | null;
	judged: number;
	upVotes: number;
	downVotes: number;
};

function mean(values: number[]): number | null {
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Per-variant statistics over a run's cells, in the order of `variantKeys`. */
export function summarizeRun(variantKeys: string[], cells: LabCellSummary[]): LabVariantStats[] {
	return variantKeys.map((variantKey) => {
		const own = cells.filter((cell) => cell.variantKey === variantKey);
		const finished = own.filter((cell) => cell.status === "done" || cell.status === "failed");
		const ok = finished.filter((cell) => cell.traceStatus === "ok");
		const scores = own.flatMap((cell) => (cell.judge && "score" in cell.judge ? [cell.judge.score] : []));
		const votes = own.flatMap((cell) => cell.votes);
		return {
			variantKey,
			total: own.length,
			finished: finished.length,
			ok: ok.length,
			failed: finished.length - ok.length,
			repaired: finished.filter((cell) => cell.repaired).length,
			meanLatencyMs: mean(ok.flatMap((cell) => (cell.latencyMs === null ? [] : [cell.latencyMs]))),
			meanCompletionTokens: mean(ok.flatMap((cell) => (cell.completionTokens === null ? [] : [cell.completionTokens]))),
			meanJudgeScore: mean(scores),
			judged: scores.length,
			upVotes: votes.filter((vote) => vote > 0).length,
			downVotes: votes.filter((vote) => vote < 0).length,
		};
	});
}

export const LAB_TRACE_RETENTION_DAYS = 30;

/** What the Lab UI knows about a recipe (no functions). */
/** The OpenAI spec's sampling temperature when a request sends none. */
export const API_DEFAULT_TEMPERATURE = 1;

export type RecipeDescriptor = {
	id: string;
	version: number;
	title: string;
	outputKind: "json" | "text";
	reasoningEffort: ReasoningEffort;
	/** What an empty temperature field means: the recipe's own value, or the API default when it sends none. */
	defaultTemperature: { value: number; source: "recipe" | "api" };
	slots: Array<{ name: string; label: string; template: string; variables: string[] }>;
};

/** Placeholder for an empty temperature field, so "default" always names a number. */
export function temperaturePlaceholder(recipe: Pick<RecipeDescriptor, "defaultTemperature">): string {
	const { value, source } = recipe.defaultTemperature;
	return `${value} (${source === "recipe" ? "recipe" : "API default"})`;
}
