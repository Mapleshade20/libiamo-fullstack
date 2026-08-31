import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
	throw redirect(303, `${base}/`);
};
