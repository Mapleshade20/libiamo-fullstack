import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) throw redirect(302, `${base}/`);
};
