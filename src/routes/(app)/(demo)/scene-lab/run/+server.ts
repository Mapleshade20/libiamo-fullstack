import { error, json } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { requireUser } from "$lib/server/auth/authz";
import { startRun } from "../simulate";
import type { RequestHandler } from "./$types";

/** Starts a Scene Lab run in the background; results appear on the page as they are saved. */
export const POST: RequestHandler = async (event) => {
	if (!dev) error(404, "Not found");
	requireUser(event);
	const body = (await event.request.json()) as { scenarios: string[]; variants: string[]; seeds?: number; concurrency?: number };
	return json({
		runId: await startRun({ scenarios: body.scenarios, variants: body.variants, seeds: body.seeds ?? 1, concurrency: body.concurrency }),
	});
};
