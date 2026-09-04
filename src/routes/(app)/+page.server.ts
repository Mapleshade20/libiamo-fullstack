import { adaptHallDataToQuestMenu } from "$lib/quest-hall/menu";
import { parseHallLocation, QUEST_HALL_DEPENDENCY } from "$lib/quest-hall/navigation";
import { requireUser } from "$lib/server/auth/authz";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { loadQuestHallData } from "$lib/server/quest-hall";
import type { Actions, PageServerLoad } from "./$types";
import { switchActiveLanguage } from "./user-language-action";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	event.depends(QUEST_HALL_DEPENDENCY);
	const hallData = await loadQuestHallData(user, getBrowserTimezone(event.cookies));
	return {
		...hallData,
		hallLocation: parseHallLocation(event.url, adaptHallDataToQuestMenu(hallData)),
	};
};

export const actions: Actions = {
	switchLanguage: switchActiveLanguage,
};
