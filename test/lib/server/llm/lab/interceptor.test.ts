import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRows } = vi.hoisted(() => ({ mockRows: { value: [] as unknown[] } }));
vi.mock("$lib/server/db", () => {
	const chain = {
		from: () => chain,
		leftJoin: () => chain,
		where: () => chain,
		limit: async () => mockRows.value,
	};
	return { db: { select: () => chain } };
});
vi.mock("$lib/server/llm/providers", () => ({
	isProviderRef: () => true,
	resolveProviderRef: async (ref: string) => ({ id: ref, apiKey: "k", baseUrl: "https://x.test", model: "m" }),
}));

import { labInterceptor, shouldCaptureCall } from "$lib/server/llm/lab/interceptor";

const recipe = {
	id: "review.notes",
	version: 1,
	title: "Notes",
	reasoningEffort: "low" as const,
	output: { kind: "text" as const, parse: String },
	build: () => [],
};
const overrideColumns = { overrideId: 3, slots: { rules: "- Be general." }, providerRef: "lab:alt", temperature: 0.2, reasoningEffort: "medium" };

beforeEach(() => {
	mockRows.value = [];
});

describe("capture policy", () => {
	it("captures by default and lets only learners with their own key opt out", () => {
		expect(shouldCaptureCall({ role: "learner", hasApiKey: false, optedOut: false })).toBe(true);
		expect(shouldCaptureCall({ role: "learner", hasApiKey: true, optedOut: false })).toBe(true);
		expect(shouldCaptureCall({ role: "learner", hasApiKey: true, optedOut: true })).toBe(false);
		// The opt-out lapses without a key, where the setting is hidden.
		expect(shouldCaptureCall({ role: "learner", hasApiKey: false, optedOut: true })).toBe(true);
		expect(shouldCaptureCall({ role: "admin", hasApiKey: true, optedOut: true })).toBe(true);
	});

	it("does not capture anonymous calls", async () => {
		await expect(labInterceptor.prepare({ recipe })).resolves.toEqual({ capture: false });
	});

	it("applies an enabled override only while its owner is staff", async () => {
		mockRows.value = [{ role: "admin", apiKeyUserId: null, optedOutAt: null, ...overrideColumns }];
		const plan = await labInterceptor.prepare({ recipe, userId: "u1" });
		expect(plan).toMatchObject({
			capture: true,
			override: {
				id: 3,
				variant: { slots: { rules: "- Be general." }, provider: { id: "lab:alt" }, options: { temperature: 0.2, reasoningEffort: "medium" } },
			},
		});

		mockRows.value = [{ role: "learner", apiKeyUserId: null, optedOutAt: null, ...overrideColumns }];
		await expect(labInterceptor.prepare({ recipe, userId: "u2" })).resolves.toEqual({ capture: true });
	});
});
