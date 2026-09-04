import { adaptHallDataToQuestMenu } from "$lib/quest-hall/menu";
import { parseHallLocation, QUEST_HALL_DEPENDENCY } from "$lib/quest-hall/navigation";
import { requireUser } from "$lib/server/auth/authz";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { loadQuestHallData } from "$lib/server/quest-hall";
import { getQuestHallPreparation } from "$lib/server/quest-hall-preparation";
import type { Actions, PageServerLoad } from "./$types";
import { switchActiveLanguage } from "./user-language-action";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	event.depends(QUEST_HALL_DEPENDENCY);
	const browserTimezone = getBrowserTimezone(event.cookies);
	const hallData = await loadQuestHallData(user, browserTimezone);
	const hallLocation = parseHallLocation(event.url, adaptHallDataToQuestMenu(hallData));
	const initialPreparation =
		hallLocation.view === "prepare" && hallLocation.task
			? await getQuestHallPreparation({
					user,
					key: hallLocation.task,
					editionDate: hallData.editionDate,
					browserTimezone,
				})
			: null;
	return {
		...hallData,
		hallLocation,
		initialPreparation,
	};
};

export const actions: Actions = {
	switchLanguage: switchActiveLanguage,
};
