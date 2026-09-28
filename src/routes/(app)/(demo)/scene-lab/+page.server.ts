import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { requireUser } from "$lib/server/auth/authz";
import type { PageServerLoad } from "./$types";
import { SCENARIOS } from "./scenarios";
import { listRuns, loadRun, referenceText, VARIANTS } from "./simulate";

export const load: PageServerLoad = async (event) => {
	if (!dev) error(404, "Not found");
	requireUser(event);
	const runs = await listRuns();
	// Several runs side by side (?runs=a,b): a baseline next to a change.
	const selected = (event.url.searchParams.get("runs") ?? runs[0] ?? "").split(",").filter((run) => runs.includes(run));
	const results = (await Promise.all(selected.map(async (run) => (await loadRun(run)).map((result) => ({ ...result, run }))))).flat();
	const scenarioIds = [...new Set(results.map((result) => result.scenarioId))];
	return {
		runs,
		selected,
		results,
		references: Object.fromEntries(await Promise.all(scenarioIds.map(async (id) => [id, await referenceText(id)] as const))),
		scenarios: SCENARIOS.filter(({ id }) => scenarioIds.includes(id)).map(({ id, label }) => ({ id, label })),
		variants: VARIANTS.map(({ key, label }) => ({ key, label })),
	};
};
