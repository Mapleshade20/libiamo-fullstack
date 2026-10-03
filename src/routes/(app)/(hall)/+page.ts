import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { adaptHallDataToQuestMenu, getQuestMenuItemId } from "$lib/quest-hall/menu";
import { parseHallLocation } from "$lib/quest-hall/navigation";
import type { QuestMenuRouteData } from "$lib/quest-hall/preparation";
import type { PageLoad } from "./$types";

/** Places the Hall's shared book data at the catalog location the URL asks for; no server round trip. */
export const load: PageLoad = async ({ url, parent }) => {
	const requestedLocation = parseHallLocation(url);
	if (requestedLocation.view === "prepare" && requestedLocation.task) {
		redirect(308, `${base}/task/${getQuestMenuItemId(requestedLocation.task)}`);
	}
	const { hall } = await parent();
	const year = url.searchParams.get("year");
	const catalogMonth = year && hall.translationTasks.some((task) => task.createdMonth.startsWith(`${year}-`)) ? `${year}-01` : hall.translationMonth;
	const questMenu: QuestMenuRouteData = {
		hall,
		hallLocation: parseHallLocation(url, adaptHallDataToQuestMenu(hall, catalogMonth, "year")),
		catalogMonth,
		initialPreparation: null,
	};
	return { questMenu };
};
