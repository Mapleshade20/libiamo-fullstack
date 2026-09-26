import type { Actions } from "./$types";
import { switchActiveLanguage } from "./user-language-action";

export const actions: Actions = {
	switchLanguage: switchActiveLanguage,
};
