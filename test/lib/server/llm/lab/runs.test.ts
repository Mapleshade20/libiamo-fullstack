import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, mockRunLabCall, mockJudge } = vi.hoisted(() => ({
	state: { updates: [] as Array<{ set: Record<string, unknown>; where: unknown }>, deleted: [] as unknown[], updateResult: [] as unknown[] },
	mockRunLabCall: vi.fn(),
	mockJudge: vi.fn(),
}));

vi.mock("$lib/server/db", () => ({
	db: {
		query: {
			llmRunCell: {
				findFirst: async () => ({
					id: 11,
					runId: 3,
					variantKey: "v1",
					run: {
						datasetId: 1,
						createdBy: "admin",
						judge: { rubric: "r", providerRef: "default" },
						variants: [{ key: "v1", label: "Baseline", slots: {}, providerRef: "default", temperature: null }],
					},
					case: { input: { n: 1 } },
				}),
			},
			llmDataset: { findFirst: async () => ({ recipeId: "test.recipe" }) },
		},
		update: () => ({
			set: (set: Record<string, unknown>) => ({
				where: (where: unknown) => {
					state.updates.push({ set, where });
					return { returning: async () => state.updateResult };
				},
			}),
		}),
		delete: () => ({ where: async (where: unknown) => void state.deleted.push(where) }),
	},
}));
vi.mock("$lib/server/llm/lab/recipes", () => ({ findRecipe: () => ({ id: "test.recipe", title: "Test" }) }));
vi.mock("$lib/server/llm/lab/execute", () => ({ runLabCall: mockRunLabCall, judgeLabOutput: mockJudge }));
vi.mock("$lib/server/llm/lab/variants", async (importOriginal) => ({
	...(await importOriginal<object>()),
	resolveVariant: async () => ({}),
}));

import { processCell } from "$lib/server/llm/lab/runs";

const dialect = new PgDialect();
const render = (where: unknown) => dialect.sqlToQuery(where as SQL);

beforeEach(() => {
	state.updates = [];
	state.deleted = [];
	mockRunLabCall.mockResolvedValue({ traceId: "trace-out", record: { error: null } });
	mockJudge.mockResolvedValue({ score: 4, rationale: "ok", traceId: "trace-judge" });
});

describe("processCell", () => {
	it("writes results only under its own claim token, tying outputs to the run", async () => {
		state.updateResult = [{ id: 11 }];
		await expect(processCell({ id: 11, claimToken: "token-b" })).resolves.toBe(true);

		expect(mockRunLabCall).toHaveBeenCalledWith(expect.anything(), { n: 1 }, {}, "admin", { label: "Baseline", runId: 3 });
		expect(mockJudge).toHaveBeenCalledWith(expect.objectContaining({ runId: 3 }));
		const [write] = state.updates;
		expect(write.set).toMatchObject({ status: "done", traceId: "trace-out", claimToken: null });
		const fence = render(write.where);
		expect(fence.sql).toContain('"claim_token" = $');
		expect(fence.params).toContain("token-b");
		expect(fence.sql).not.toContain('"attempts"');
	});

	it("discards its outputs when the claim was lost to a cancel or a newer claim", async () => {
		state.updateResult = [];
		await expect(processCell({ id: 11, claimToken: "stale" })).resolves.toBe(false);
		expect(state.deleted).toHaveLength(1);
		expect(render(state.deleted[0]).params).toEqual(["trace-out", "trace-judge"]);
	});
});
