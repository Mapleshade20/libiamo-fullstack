import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	if (!dev) {
		error(404, "Not found");
	}
	return {};
};
