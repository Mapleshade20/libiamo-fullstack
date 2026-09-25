import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { requireAdmin } from "$lib/server/auth/authz";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = (event) => {
	requireAdmin(event);
	redirect(302, `${base}/admin/templates`);
};
