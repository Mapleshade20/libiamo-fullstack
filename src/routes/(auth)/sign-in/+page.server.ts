import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { base } from "$app/paths";
import { signInSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth/auth";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		return redirect(302, `${base}/`);
	}
	const reset = event.url.searchParams.get("reset");
	return { resetSuccess: reset === "success" };
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const raw = {
			email: formData.get("email")?.toString() ?? "",
			password: formData.get("password")?.toString() ?? "",
		};

		const result = signInSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		try {
			await auth.api.signInEmail({
				body: {
					email: result.data.email,
					password: result.data.password,
				},
				headers: event.request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || "Sign in failed", values: raw });
			}
			return fail(500, { message: "Unexpected error", values: raw });
		}

		return redirect(302, `${base}/`);
	},
};
