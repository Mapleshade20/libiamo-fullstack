import { requireUser } from "$lib/server/auth/authz";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { loadQuestHallData } from "$lib/server/quest-hall";
import type { Actions, PageServerLoad } from "./$types";
import { switchActiveLanguage } from "./user-language-action";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	return loadQuestHallData(user, getBrowserTimezone(event.cookies));
};

export const actions: Actions = {
	switchLanguage: switchActiveLanguage,
};
