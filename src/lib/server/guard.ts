import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";

/*
 * The first line of every remote function and endpoint: each is a public URL, whatever page calls it. hooks.server.ts
 * has already sent signed-out visitors of pages away; these answer the requests that come anyway.
 */
export function learner() {
	const user = getRequestEvent().locals.user;
	if (!user) error(401, "Sign in first.");
	return user;
}

export function admin() {
	const user = learner();
	if (user.role !== "admin") error(404, "Not found");
	return user;
}
