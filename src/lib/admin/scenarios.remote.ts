import { error } from "@sveltejs/kit";
import { z } from "zod";
import { PLACES, SCENARIO_KINDS, SCENARIO_STATUSES, URGENCIES } from "#lib/constants.ts";
import {
	adminScenario,
	adminScenarios,
	confirmSource,
	deleteScenario,
	remakeSource,
	ScenarioError,
	saveScenario,
	withdrawScenario,
} from "#lib/server/admin/scenarios.ts";
import { admin } from "#lib/server/guard.ts";
import { command, query } from "$app/server";
import { waiting } from "./admin.remote.ts";

/* The admin's scenarios: the list, one scenario, saving and publishing it, its translation sources. */
export const scenarioList = query(async () => {
	admin();
	return adminScenarios();
});

export const scenarioOne = query(z.string().max(60), async (id) => {
	admin();
	return adminScenario(id);
});

const Draft = z.object({
	id: z.string().regex(/^[a-z0-9-]{2,60}$/, "An id is 2 to 60 lowercase letters, digits and hyphens."),
	kind: z.enum(SCENARIO_KINDS),
	place: z.enum(PLACES),
	status: z.enum(SCENARIO_STATUSES),
	minutes: z.number().int().min(1).max(120),
	urgency: z.enum(URGENCIES).nullable(),
	maxTurns: z.number().int().min(1).max(100).nullable(),
	workId: z.string().max(60).nullable(),
	versions: z.record(z.string(), z.unknown()),
});

/** Saves (or publishes) a scenario; answers what is wrong with it instead of throwing for what the admin can fix. */
export const saveOne = command(z.object({ draft: Draft, isNew: z.boolean(), publish: z.boolean() }), async ({ draft, isNew, publish }) => {
	const u = admin();
	try {
		// The versions are validated whole by their kind and place in saveScenario.
		await saveScenario(draft as Parameters<typeof saveScenario>[0], { isNew, publish, by: u.id });
	} catch (e) {
		if (e instanceof ScenarioError) return { ok: false as const, error: e.message };
		throw e;
	}
	await Promise.all([scenarioOne(draft.id).refresh(), scenarioList().refresh()]);
	return { ok: true as const };
});

export const withdrawOne = command(z.string().max(60), async (id) => {
	admin();
	await withdrawScenario(id);
	await Promise.all([scenarioOne(id).refresh(), scenarioList().refresh()]);
});

export const deleteOne = command(z.string().max(60), async (id) => {
	admin();
	try {
		await deleteScenario(id);
	} catch (e) {
		if (e instanceof ScenarioError) error(409, e.message);
		throw e;
	}
	await scenarioList().refresh();
});

export const remake = command(
	z.object({ scenarioId: z.string().max(60), sourceId: z.uuid(), generation: z.uuid() }),
	async ({ scenarioId, sourceId, generation }) => {
		admin();
		await remakeSource(sourceId, generation);
		await scenarioOne(scenarioId).refresh();
	},
);

const line = (max: number) => z.string().trim().max(max);
/** Confirms a source, as the admin edited it when `edit` is given (refused with what to fix). */
export const confirm = command(
	z.object({
		scenarioId: z.string().max(60),
		sourceId: z.uuid(),
		generation: z.uuid(),
		edit: z
			.object({
				title: line(200),
				text: line(20_000).min(1),
				glossary: z.array(z.object({ term: line(120), shown: line(120), gloss: line(400) })).max(80),
			})
			.optional(),
	}),
	async ({ scenarioId, sourceId, generation, edit }) => {
		admin();
		try {
			await confirmSource(sourceId, generation, edit);
		} catch (e) {
			if (e instanceof ScenarioError) error(400, e.message);
			throw e;
		}
		await Promise.all([scenarioOne(scenarioId).refresh(), scenarioList().refresh(), waiting().refresh()]);
	},
);
