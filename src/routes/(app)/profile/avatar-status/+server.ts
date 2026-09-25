import { json } from "@sveltejs/kit";
import { requireUser } from "$lib/server/auth/authz";
import { hasGravatarAvatar } from "$lib/server/gravatar";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	return json({ hasGravatarPhoto: await hasGravatarAvatar(user.email) });
};
