import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: { deleteWhere: [] as unknown[], countWhere: [] as unknown[] } }));
vi.mock("$lib/server/db", () => ({
	db: {
		delete: () => ({
			where: (where: unknown) => {
				state.deleteWhere.push(where);
				return { returning: async () => [{ id: "a" }, { id: "b" }] };
			},
		}),
		select: () => ({
			from: () => ({
				where: async (where: unknown) => {
					state.countWhere.push(where);
					return [{ total: 1 }];
				},
			}),
		}),
	},
}));

import { deleteTraces, traceRow } from "$lib/server/llm/lab/traces";
import { defineLlmRecipe } from "$lib/server/llm/recipe";
import type { LlmCallRecord } from "$lib/server/llm/run";

const recipe = defineLlmRecipe({
	id: "test.r",
	version: 2,
	title: "R",
	reasoningEffort: "low",
	output: { kind: "text", parse: (content: string) => content },
	build: () => [],
});

function record(overrides: Partial<LlmCallRecord> = {}): LlmCallRecord {
	return {
		recipe,
		origin: "override",
		userId: "u1",
		subjects: { taskId: 4, sessionId: 5 },
		input: { when: new Date("2026-09-24T00:00:00Z"), missing: undefined },
		variant: {
			slots: { system: "S" },
			provider: { id: "lab:alt", apiKey: "secret-key", baseUrl: "https://alt.test/v1", model: "m" },
			options: { temperature: 1 },
		},
		messages: [{ role: "user", content: "hi" }],
		options: { temperature: 1 },
		attempts: [{ stage: "initial", requestMessages: [], content: "out", finishReason: "stop", errors: [] }],
		response: { content: "out", finishReason: "stop", raw: {}, usage: { promptTokens: 10, completionTokens: 3 } },
		value: "out",
		error: null,
		latencyMs: 12.4,
		...overrides,
	};
}

describe("traceRow", () => {
	it("stores subjects, usage and a credential-free variant", () => {
		const row = traceRow(record());
		expect(row).toMatchObject({ recipeId: "test.r", recipeVersion: 2, taskId: 4, sessionId: 5, status: "ok", promptTokens: 10, completionTokens: 3 });
		expect(row.variant).toEqual({ slots: { system: "S" }, providerId: "lab:alt", options: { temperature: 1 } });
		expect(JSON.stringify(row)).not.toContain("secret-key");
		// Inputs are stored as JSON: dates become strings, undefined keys disappear.
		expect(row.input).toEqual({ when: "2026-09-24T00:00:00.000Z" });
	});

	it("records the failure stage and keeps the rejected value", () => {
		expect(traceRow(record({ response: null, value: null, error: new Error("down"), errorStage: "provider" })).error).toMatchObject({
			stage: "provider",
			message: "down",
		});
		expect(traceRow(record({ error: new Error("invalid"), errorStage: "finalize" }))).toMatchObject({
			status: "error",
			error: { stage: "finalize" },
			output: "out",
		});
	});

	it("ties run outputs to their run and leaves Playground traces unowned", () => {
		expect(traceRow(record({ origin: "lab" }), { label: "Baseline", runId: 7 })).toMatchObject({ runId: 7, variant: { label: "Baseline" } });
		expect(traceRow(record({ origin: "lab" }), { label: "playground" }).runId).toBeNull();
	});
});

describe("deleteTraces", () => {
	const dialect = new PgDialect();
	const render = (where: unknown) => dialect.sqlToQuery(where as SQL);

	beforeEach(() => {
		state.deleteWhere = [];
		state.countWhere = [];
	});

	it("never deletes run outputs and reports how many it kept", async () => {
		await expect(deleteTraces({ ids: ["a", "b", "c"] })).resolves.toEqual({ deleted: 2, keptInRuns: 1 });
		const deleted = render(state.deleteWhere[0]);
		expect(deleted.sql).toContain('"llm_trace"."run_id" is null');
		expect(deleted.params).toEqual(["a", "b", "c"]);
		expect(render(state.countWhere[0]).sql).toContain('"llm_trace"."run_id" is not null');
	});

	it("deletes a whole filtered view regardless of paging", async () => {
		await deleteTraces({ filters: { recipeId: "review.notes", status: "error" } });
		const deleted = render(state.deleteWhere[0]);
		expect(deleted.params).toEqual(["review.notes", "error"]);
		expect(deleted.sql).not.toContain("created_at");
	});

	it("does nothing for an empty selection", async () => {
		await expect(deleteTraces({ ids: [] })).resolves.toEqual({ deleted: 0, keptInRuns: 0 });
		expect(state.deleteWhere).toEqual([]);
	});
});
