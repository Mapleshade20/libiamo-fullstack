import { json } from "@sveltejs/kit";
import { countActiveOverrides } from "$lib/server/llm/lab/overrides";
import { describeRecipes } from "$lib/server/llm/lab/recipes";
import { listTraces } from "$lib/server/llm/lab/traces";
import type { RequestHandler } from "./$types";

const INSPECTOR_LIMIT = 20;

/** The staff inspector: the viewer's own recent calls, narrowed to a task when the page shows one. */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) return json({ error: "Unauthorized" }, { status: 401 });
	if (user.role !== "admin") return json({ error: "Forbidden" }, { status: 403 });
	const task = Number(url.searchParams.get("task"));
	const taskId = Number.isSafeInteger(task) && task > 0 ? task : undefined;
	const [traces, activeOverrides] = await Promise.all([
		listTraces({ userId: user.id, taskId, limit: INSPECTOR_LIMIT }),
		countActiveOverrides(user.id),
	]);
	const titles = new Map(describeRecipes().map((recipe) => [recipe.id, recipe.title]));
	return json({
		activeOverrides,
		traces: traces.map((trace) => ({
			id: trace.id,
			createdAt: trace.createdAt,
			recipeTitle: titles.get(trace.recipeId) ?? trace.recipeId,
			origin: trace.origin,
			status: trace.status,
			latencyMs: trace.latencyMs,
			model: trace.route?.model ?? null,
			repaired: trace.attemptCount > 1,
		})),
	});
};
