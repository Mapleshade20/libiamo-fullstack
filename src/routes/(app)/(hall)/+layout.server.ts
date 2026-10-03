import { QUEST_HALL_DEPENDENCY } from "$lib/quest-hall/navigation";
import { requireUser } from "$lib/server/auth/authz";
import { loadQuestHallData } from "$lib/server/quest-hall/hall";
import { getBrowserTimezone } from "$lib/time/browser-timezone";
import type { LayoutServerLoad } from "./$types";

/**
 * The book's data, shared by `/` and `/task/[id]`. It reads neither the URL nor params, so moving
 * between the catalog and a task's details keeps it: it loads on entering the Hall from another page
 * and on `QUEST_HALL_DEPENDENCY`. Pages combine it in their universal `+page.ts`, never through
 * `parent()` in a server load, which re-runs this load on the server for every page request.
 */
export const load: LayoutServerLoad = async (event) => {
	event.depends(QUEST_HALL_DEPENDENCY);
	const user = requireUser(event);
	return { hall: await loadQuestHallData(user, getBrowserTimezone(event.cookies)) };
};
