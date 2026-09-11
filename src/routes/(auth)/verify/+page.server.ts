import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const pending = event.url.searchParams.get("pending") === "1";
	const error = event.url.searchParams.get("error");
	const success = event.url.searchParams.get("success") === "1";
	return { pending, error, success, emailChange: event.url.searchParams.get("emailChange") === "1" };
};
