import { error, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";

export function requireUser(event: { locals: App.Locals }) {
	const user = event.locals.user;
	if (!user) throw redirect(302, `${base}/sign-in`);

	return user;
}

export function requireAdmin(event: { locals: App.Locals }) {
	const user = requireUser(event);
	if (user.role !== "admin") throw error(403, "Forbidden");

	return user;
}
