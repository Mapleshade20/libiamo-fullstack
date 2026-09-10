import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { adaptHallDataToQuestMenu, getQuestMenuItemId } from "$lib/quest-hall/menu";
import { parseHallLocation, QUEST_HALL_DEPENDENCY } from "$lib/quest-hall/navigation";
import { requireUser } from "$lib/server/auth/authz";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { loadQuestHallData } from "$lib/server/quest-hall";
import type { Actions, PageServerLoad } from "./$types";
import { switchActiveLanguage } from "./user-language-action";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	event.depends?.(QUEST_HALL_DEPENDENCY);
	const requestedLocation = parseHallLocation(event.url);
	if (requestedLocation.view === "prepare" && requestedLocation.task) {
		const id = getQuestMenuItemId(requestedLocation.task);
		throw redirect(308, `${base}/${requestedLocation.section === "translation" ? "translate" : "task"}/${id}`);
	}
	const browserTimezone = getBrowserTimezone(event.cookies);
	const hallData = await loadQuestHallData(user, browserTimezone);
	const year = event.url.searchParams.get("year");
	const catalogMonth =
		year && hallData.translationTasks.some((task) => task.createdMonth.startsWith(`${year}-`)) ? `${year}-01` : hallData.translationMonth;
	const hallLocation = parseHallLocation(event.url, adaptHallDataToQuestMenu(hallData, catalogMonth, "year"));

	return {
		...hallData,
		hall: hallData,
		hallLocation,
		catalogMonth,
		initialPreparation: null,
		questMenu: { hall: hallData, hallLocation, catalogMonth, initialPreparation: null },
	};
};

export const actions: Actions = {
	switchLanguage: switchActiveLanguage,
};
