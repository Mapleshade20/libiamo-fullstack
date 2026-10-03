import { questHallDetails } from "$lib/quest-hall/details";
import type { PageLoad } from "./$types";

/** Opens the Hall's shared book on this task's details, reusing the layout's data without a reload. */
export const load: PageLoad = async ({ data, parent }) => {
	const { hall } = await parent();
	const { preparation } = data;
	return { kind: preparation.kind, ...preparation.data, ...questHallDetails(hall, preparation) };
};
