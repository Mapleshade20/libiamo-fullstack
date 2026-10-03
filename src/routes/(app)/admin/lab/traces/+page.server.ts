import { fail } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/authz";
import { describeRecipes } from "$lib/server/llm/lab/recipes";
import { countMatchingTraces, deleteTraces, listTraces, type TraceMatchFilters } from "$lib/server/llm/lab/traces";
import type { Actions, PageServerLoad } from "./$types";

const ORIGINS = ["app", "override", "lab"] as const;
const STATUSES = ["ok", "error"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SELECTED = 500;
const PAGE_SIZE = 50;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
	return allowed.find((candidate) => candidate === value);
}

/** The view's filters, read the same way from the query string and from the delete form. */
function matchFilters(get: (name: string) => string | null): TraceMatchFilters {
	const task = Number(get("task"));
	return {
		recipeId: get("recipe") || undefined,
		userId: get("user") || undefined,
		taskId: Number.isSafeInteger(task) && task > 0 ? task : undefined,
		origin: pick(get("origin"), ORIGINS),
		status: pick(get("status"), STATUSES),
	};
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const params = event.url.searchParams;
	const beforeParam = params.get("before");
	const before = beforeParam ? new Date(beforeParam) : undefined;
	const filters = { ...matchFilters((name) => params.get(name)), before: before && !Number.isNaN(before.getTime()) ? before : undefined };
	const traces = await listTraces({ ...filters, limit: PAGE_SIZE });
	const hasMore = traces.length === PAGE_SIZE;
	return {
		traces,
		hasMore,
		// Only needed when the view spans more than this page; otherwise the rows are the whole match.
		matching: hasMore || filters.before ? await countMatchingTraces(matchFilters((name) => params.get(name))) : null,
		recipes: describeRecipes().map(({ id, title }) => ({ id, title })),
		filters: { ...filters, before: filters.before?.toISOString() },
	};
};

export const actions: Actions = {
	delete: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		if (form.get("scope") === "matching") {
			const filters = matchFilters((name) => {
				const value = form.get(name);
				return typeof value === "string" ? value : null;
			});
			return { deleteResult: await deleteTraces({ filters }) };
		}
		const ids = form.getAll("id").filter((value): value is string => typeof value === "string" && UUID.test(value));
		if (ids.length === 0 || ids.length > MAX_SELECTED) return fail(400, { deleteError: "Select between 1 and 500 traces." });
		return { deleteResult: await deleteTraces({ ids }) };
	},
};
