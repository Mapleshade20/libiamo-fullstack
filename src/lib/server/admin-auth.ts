import { error, redirect } from "@sveltejs/kit";

export function requireAdmin(event: { locals: App.Locals }) {
	const user = event.locals.user;
	if (!user) throw redirect(302, "/sign-in");
	if (user.role !== "admin") throw error(403, "Forbidden");
	return user;
}
